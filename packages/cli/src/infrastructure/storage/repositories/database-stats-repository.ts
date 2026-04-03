import { KeyManager } from '@/crypto/keys.js';
import type { Block } from '@/domain/memory/models';

interface StatsSqliteDb {
  prepare(sql: string): any;
  pragma(input: string, options?: { simple?: boolean }): unknown;
}

interface DatabaseStatsRuntime {
  db: StatsSqliteDb;
  path: string;
  enableEncryption: boolean;
  useSQLCipher: boolean;
  getContentKey: () => Buffer;
  rowToBlock: (row: unknown) => Block;
}

export class DatabaseStatsRepository {
  constructor(private readonly runtime: DatabaseStatsRuntime) {}

  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byAnnotation: Record<string, number>;
  } {
    const totalStmt = this.runtime.db.prepare('SELECT COUNT(*) as count FROM blocks');
    const { count: total } = totalStmt.get() as { count: number };

    const statusStmt = this.runtime.db.prepare(`
      SELECT status, COUNT(*) as count FROM blocks GROUP BY status
    `);
    const statusRows = statusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
    }

    const annotationStmt = this.runtime.db.prepare(`
      SELECT annotation, COUNT(*) as count FROM blocks GROUP BY annotation ORDER BY count DESC LIMIT 5
    `);
    const annotationRows = annotationStmt.all() as Array<{ annotation: string; count: number }>;
    const byAnnotation: Record<string, number> = {};
    for (const row of annotationRows) {
      byAnnotation[row.annotation] = row.count;
    }

    return { total, byStatus, byAnnotation };
  }

  getStatusBreakdown(): {
    total: number;
    active: number;
    cooling: number;
    cold: number;
    archived: number;
  } {
    const stmt = this.runtime.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'cooling' THEN 1 ELSE 0 END) as cooling,
        SUM(CASE WHEN status = 'cold' THEN 1 ELSE 0 END) as cold,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
      FROM blocks
    `);

    const row = stmt.get() as {
      total: number;
      active: number;
      cooling: number;
      cold: number;
      archived: number;
    };

    return {
      total: row.total || 0,
      active: row.active || 0,
      cooling: row.cooling || 0,
      cold: row.cold || 0,
      archived: row.archived || 0,
    };
  }

  checkHealth(): {
    ok: boolean;
    integrity?: string;
    size?: number;
    path?: string;
    blockCount?: number;
  } {
    try {
      const integrityResult = this.runtime.db.pragma('integrity_check');
      const ok = Array.isArray(integrityResult)
        ? integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok'
        : String(integrityResult) === 'ok';

      const pageSizeResult = this.runtime.db.pragma('page_size') as any;
      const pageCountResult = this.runtime.db.pragma('page_count') as any;

      const pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
      const pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;
      const size = (pageSize || 0) * (pageCount || 0);

      const count = this.runtime.db.prepare('SELECT COUNT(*) as count FROM blocks').get() as { count: number };

      return {
        ok,
        integrity: ok ? 'ok' : String(integrityResult),
        size,
        path: this.runtime.path,
        blockCount: count.count,
      };
    } catch {
      return {
        ok: false,
        path: this.runtime.path,
      };
    }
  }

  getTUIStats(): {
    total: number;
    weeklyNew: number;
    associations: number;
    queryHits: number;
    byNature: Record<string, number>;
    byStatus: Record<string, number>;
    recentBlocks: Array<{ id: string; content: string; annotation: string; vitality: number; created_at: number }>;
    dbSize: number;
  } {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

    const total = (this.runtime.db.prepare('SELECT COUNT(*) as count FROM blocks').get() as { count: number }).count;
    const weeklyNew = (this.runtime.db.prepare('SELECT COUNT(*) as count FROM blocks WHERE created_at > ?').get(weekAgo) as { count: number }).count;

    let associations = 0;
    try { associations = (this.runtime.db.prepare('SELECT COUNT(*) as count FROM associations').get() as { count: number }).count; } catch {}

    let queryHits = 0;
    try { queryHits = (this.runtime.db.prepare('SELECT COUNT(*) as count FROM query_logs').get() as { count: number }).count; } catch {}

    const natureRows = this.runtime.db.prepare(`
      SELECT
        CASE
          WHEN annotation LIKE '决策%' THEN 'decision'
          WHEN annotation LIKE '事实%' THEN 'fact'
          WHEN annotation LIKE '知识%' THEN 'knowledge'
          WHEN annotation LIKE '指令%' THEN 'preference'
          ELSE 'other'
        END as nature,
        COUNT(*) as count
      FROM blocks
      WHERE annotation != 'pending'
      GROUP BY nature
      ORDER BY count DESC
    `).all() as Array<{ nature: string; count: number }>;

    const byNature: Record<string, number> = {};
    for (const row of natureRows) byNature[row.nature] = row.count;

    const statusRows = this.runtime.db.prepare('SELECT status, COUNT(*) as count FROM blocks GROUP BY status').all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) byStatus[row.status] = row.count;

    const recentRows = this.runtime.db.prepare(`
      SELECT id, content, annotation, vitality, created_at
      FROM blocks
      WHERE annotation != 'pending'
      ORDER BY created_at DESC
      LIMIT 5
    `).all() as Array<{ id: string; content: string; annotation: string; vitality: number; created_at: number }>;

    const pageSizeResult = this.runtime.db.pragma('page_size') as any;
    const pageCountResult = this.runtime.db.pragma('page_count') as any;
    const pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
    const pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;

    return {
      total,
      weeklyNew,
      associations,
      queryHits,
      byNature,
      byStatus,
      recentBlocks: recentRows.map((row) => ({
        ...row,
        content: (this.runtime.enableEncryption && !this.runtime.useSQLCipher)
          ? KeyManager.decryptContent(row.content, this.runtime.getContentKey())
          : row.content,
      })),
      dbSize: (pageSize || 0) * (pageCount || 0),
    };
  }
}
