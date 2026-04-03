import type { SimilarQueryRecord } from './query-pack.js';

export interface QueryHistoryStore {
  save(record: {
    id: string;
    timestamp: number;
    query: string;
    resultCount: number;
  }): void;
  listRecent(options: {
    sinceTimestamp: number;
    limit?: number;
  }): SimilarQueryRecord[];
  purgeBefore(timestamp: number): void;
}

interface QueryHistorySqlStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown;
}

export interface QueryHistorySqlDb {
  prepare(sql: string): QueryHistorySqlStatement;
}

export function createSqlQueryHistoryStore(db: QueryHistorySqlDb): QueryHistoryStore {
  return {
    save(record) {
      const statement = db.prepare(`
        INSERT INTO query_logs (id, timestamp, query, result_count)
        VALUES (?, ?, ?, ?)
      `);
      statement.run(record.id, record.timestamp, record.query, record.resultCount);
    },
    listRecent(options) {
      const statement = db.prepare(`
        SELECT query, timestamp FROM query_logs
        WHERE timestamp > ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      return statement.all(options.sinceTimestamp, options.limit ?? 50) as SimilarQueryRecord[];
    },
    purgeBefore(timestamp) {
      const statement = db.prepare('DELETE FROM query_logs WHERE timestamp < ?');
      statement.run(timestamp);
    },
  };
}
