import { DatabaseError } from '@/domain/errors/index.js';
import type { HostId } from '@/domain/host/contracts/types.js';
import type { CorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';

interface StorageSqliteDb {
  prepare(sql: string): any;
}

export class HostImportCursorStore {
  private readonly db: StorageSqliteDb | null;
  private readonly facadeDb: CorivoDatabase | null;

  constructor(db: StorageSqliteDb | CorivoDatabase) {
    if (this.isSqliteDb(db)) {
      this.db = db;
      this.facadeDb = null;
      return;
    }

    this.db = null;
    this.facadeDb = db;
  }

  get(host: HostId): string | null {
    if (this.facadeDb) {
      return this.facadeDb.getHostImportCursor(host);
    }
    const row = this.getSqliteDb().prepare(`
      SELECT last_import_cursor
      FROM host_import_cursors
      WHERE host = ?
    `).get(host) as { last_import_cursor: string } | undefined;

    return row?.last_import_cursor ?? null;
  }

  set(host: HostId, cursor: string): void {
    if (this.facadeDb) {
      this.facadeDb.setHostImportCursor(host, cursor);
      return;
    }
    if (!host || !cursor) {
      throw new DatabaseError('Host import cursor 缺少必填字段');
    }

    const now = Date.now();
    this.getSqliteDb().prepare(`
      INSERT INTO host_import_cursors (host, last_import_cursor, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(host) DO UPDATE SET
        last_import_cursor = excluded.last_import_cursor,
      updated_at = excluded.updated_at
    `).run(host, cursor, now);
  }

  private isSqliteDb(value: StorageSqliteDb | CorivoDatabase): value is StorageSqliteDb {
    return 'prepare' in value;
  }

  private getSqliteDb(): StorageSqliteDb {
    if (!this.db) {
      throw new Error('HostImportCursorStore sqlite runtime is unavailable');
    }
    return this.db;
  }
}
