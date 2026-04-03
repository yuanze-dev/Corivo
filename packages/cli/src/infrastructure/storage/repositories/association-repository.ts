import { DatabaseError } from '@/errors';
import type {
  Association,
  AssociationFilter,
  AssociationStats,
  CreateAssociationInput,
} from '@/domain/memory/models';
import { AssociationType, generateAssociationId } from '@/domain/memory/models/association.js';

interface AssociationSqliteDb {
  prepare(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

interface AssociationRepositoryRuntime {
  db: AssociationSqliteDb;
  rowToAssociation: (row: unknown) => Association;
}

export class AssociationRepository {
  constructor(private readonly runtime: AssociationRepositoryRuntime) {}

  create(input: CreateAssociationInput): Association {
    const id = generateAssociationId();
    const now = Date.now();
    const stmt = this.runtime.db.prepare(`
      INSERT OR REPLACE INTO associations (
        id, from_id, to_id, type, direction, confidence, reason, context_tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        input.from_id,
        input.to_id,
        input.type,
        input.direction || 'one_way',
        input.confidence,
        input.reason || null,
        JSON.stringify(input.context_tags || []),
        now,
      );
    } catch (error) {
      throw new DatabaseError('创建关联失败', { cause: error, associationId: id });
    }

    return {
      id,
      from_id: input.from_id,
      to_id: input.to_id,
      type: input.type,
      direction: input.direction || 'one_way',
      confidence: input.confidence,
      reason: input.reason,
      context_tags: input.context_tags,
      created_at: now,
    } as Association;
  }

  batchCreate(inputs: CreateAssociationInput[]): number {
    if (inputs.length === 0) return 0;

    let createdCount = 0;
    const transaction = this.runtime.db.transaction(() => {
      const stmt = this.runtime.db.prepare(`
        INSERT OR REPLACE INTO associations (
          id, from_id, to_id, type, direction, confidence, reason, context_tags, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const input of inputs) {
        try {
          const id = generateAssociationId();
          const now = Date.now();
          stmt.run(
            id,
            input.from_id,
            input.to_id,
            input.type,
            input.direction || 'one_way',
            input.confidence,
            input.reason || null,
            JSON.stringify(input.context_tags || []),
            now,
          );
          createdCount++;
        } catch (error) {
          console.error(`批量创建关联失败 ${input.from_id} -> ${input.to_id}:`, error);
        }
      }
    });

    try {
      transaction();
      return createdCount;
    } catch (error) {
      throw new DatabaseError('批量创建关联失败', { cause: error });
    }
  }

  query(filter: AssociationFilter = {}): Association[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.from_id) {
      conditions.push('from_id = ?');
      values.push(filter.from_id);
    }
    if (filter.to_id) {
      conditions.push('to_id = ?');
      values.push(filter.to_id);
    }
    if (filter.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }
    if (filter.minConfidence !== undefined) {
      conditions.push('confidence >= ?');
      values.push(filter.minConfidence);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const stmt = this.runtime.db.prepare(`
      SELECT * FROM associations ${whereClause} ORDER BY confidence DESC ${limitClause}
    `);

    try {
      const rows = stmt.all(...values) as unknown[];
      return rows.map((row) => this.runtime.rowToAssociation(row));
    } catch (error) {
      throw new DatabaseError('查询关联失败', { cause: error });
    }
  }

  getBlockAssociations(blockId: string, minConfidence = 0.5): Association[] {
    const stmt = this.runtime.db.prepare(`
      SELECT * FROM associations
      WHERE (from_id = ? OR to_id = ?)
        AND confidence >= ?
      ORDER BY confidence DESC
    `);

    try {
      const rows = stmt.all(blockId, blockId, minConfidence) as unknown[];
      return rows.map((row) => this.runtime.rowToAssociation(row));
    } catch (error) {
      throw new DatabaseError('获取 block 关联失败', { cause: error, blockId });
    }
  }

  delete(id: string): boolean {
    const stmt = this.runtime.db.prepare('DELETE FROM associations WHERE id = ?');

    try {
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('删除关联失败', { cause: error, associationId: id });
    }
  }

  deleteByBlock(blockId: string): number {
    const stmt = this.runtime.db.prepare('DELETE FROM associations WHERE from_id = ? OR to_id = ?');

    try {
      const result = stmt.run(blockId, blockId);
      return result.changes;
    } catch (error) {
      throw new DatabaseError('删除 block 关联失败', { cause: error, blockId });
    }
  }

  getStats(): AssociationStats {
    const totalStmt = this.runtime.db.prepare('SELECT COUNT(*) as count FROM associations');
    const { count: total } = totalStmt.get() as { count: number };

    const typeStmt = this.runtime.db.prepare(`
      SELECT type, COUNT(*) as count FROM associations GROUP BY type
    `);
    const typeRows = typeStmt.all() as Array<{ type: string; count: number }>;
    const byType: Record<AssociationType, number> = {
      [AssociationType.SIMILAR]: 0,
      [AssociationType.RELATED]: 0,
      [AssociationType.CONFLICTS]: 0,
      [AssociationType.REFINES]: 0,
      [AssociationType.SUPERSEDES]: 0,
      [AssociationType.CAUSES]: 0,
      [AssociationType.DEPENDS_ON]: 0,
    };
    for (const row of typeRows) {
      if (row.type in byType) {
        byType[row.type as AssociationType] = row.count;
      }
    }

    const avgStmt = this.runtime.db.prepare('SELECT AVG(confidence) as avg FROM associations');
    const { avg } = avgStmt.get() as { avg: number | null };

    const activeStmt = this.runtime.db.prepare(`
      SELECT block_id, COUNT(*) as count FROM (
        SELECT from_id as block_id FROM associations
        UNION ALL
        SELECT to_id as block_id FROM associations
      )
      GROUP BY block_id
      ORDER BY count DESC
      LIMIT 10
    `);
    const mostConnected = activeStmt.all() as Array<{ block_id: string; count: number }>;

    return {
      total: total || 0,
      byType,
      avgConfidence: avg || 0,
      mostConnected,
    };
  }
}
