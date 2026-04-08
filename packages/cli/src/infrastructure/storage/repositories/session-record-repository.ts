import { DatabaseError } from '@/domain/errors/index.js';
import type { SessionRecord } from '@/memory-pipeline/contracts/session-record.js';
import type { SessionRecordQuery } from '@/memory-pipeline/sources/session-record-source.js';

interface SessionRecordSqliteDb {
  prepare(sql: string): any;
}

interface SessionRecordRepositoryRuntime {
  db: SessionRecordSqliteDb;
  rowToSessionRecord: (row: unknown, messages: unknown[]) => SessionRecord;
}

export class SessionRecordRepository {
  constructor(private readonly runtime: SessionRecordRepositoryRuntime) {}

  query(query: SessionRecordQuery = {}): SessionRecord[] {
    const freshnessSql = 'COALESCE(updated_at, ended_at, created_at, started_at)';
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query.sessionKind) {
      conditions.push('kind = ?');
      values.push(query.sessionKind);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = `ORDER BY ${freshnessSql} DESC, id DESC`;
    const recordStmt = this.runtime.db.prepare(`
      SELECT
        id,
        kind,
        source_ref,
        created_at,
        updated_at,
        started_at,
        ended_at,
        metadata,
        ${freshnessSql} AS freshness_value
      FROM session_records
      ${whereClause}
      ${orderClause}
    `);
    const messageStmt = this.runtime.db.prepare(`
      SELECT
        id,
        session_id,
        role,
        content,
        sequence,
        created_at,
        metadata
      FROM session_messages
      WHERE session_id = ?
      ORDER BY sequence ASC, created_at ASC, id ASC
    `);

    try {
      const rows = recordStmt.all(...values) as unknown[];
      return rows.map((row: any) =>
        this.runtime.rowToSessionRecord(
          row,
          messageStmt.all(row.id) as unknown[],
        )
      );
    } catch (error) {
      throw new DatabaseError('查询 Session Records 失败', { cause: error });
    }
  }
}
