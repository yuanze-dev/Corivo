/**
 * Query history tracker
 *
 * Record the user's query for "You have also checked similar queries before" reminder
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/index.js';
import { generateBlockId } from '../models/block.js';
import { createLogger, type Logger } from '../utils/logging.js';

interface QueryHistoryRuntime {
  logger: Pick<Logger, 'debug'>;
  clock: { now(): number };
}

/**
 * Query records
 */
export interface QueryRecord {
  id: string;
  timestamp: number;
  query: string;
  resultCount: number;
  resultIds: string[];
}

/**
 * Similar query reminder
 */
export interface SimilarQueryReminder {
  hasSimilar: boolean;
  message: string;
  similarQueries: Array<{ query: string; timestamp: number }>;
}

/**
 * Query history tracker
 */
export class QueryHistoryTracker {
  private readonly runtime: QueryHistoryRuntime;

  constructor(
    private db: CorivoDatabase,
    runtime?: Partial<QueryHistoryRuntime>
  ) {
    const fallbackLogger = createLogger();
    this.runtime = {
      logger: runtime?.logger ?? fallbackLogger,
      clock: runtime?.clock ?? { now: () => Date.now() },
    };
  }

  /**
   * Record query
   */
  recordQuery(query: string, results: Block[]): void {
    const record: QueryRecord = {
      id: generateBlockId().replace('blk_', 'qry_'),
      timestamp: this.runtime.clock.now(),
      query,
      resultCount: results.length,
      resultIds: results.map((r) => r.id),
    };

    // Save to database
    try {
      const stmt = (this.db as any).db.prepare(`
        INSERT INTO query_logs (id, timestamp, query, result_count)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(record.id, record.timestamp, record.query, record.resultCount);
    } catch (error) {
      // The table may not exist yet, failing silently
      this.runtime.logger.debug(
        `[query-history] 记录查询失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find similar historical queries
   *
   * @param currentQuery - the current query
   * @returns similar query reminder
   */
  findSimilarQueries(currentQuery: string): SimilarQueryReminder {
    try {
      // Get query records for the last 7 days
      const stmt = (this.db as any).db.prepare(`
        SELECT query, timestamp FROM query_logs
        WHERE timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 50
      `);

      const sevenDaysAgo = this.runtime.clock.now() - 7 * 24 * 60 * 60 * 1000;
      const rows = stmt.all(sevenDaysAgo) as Array<{ query: string; timestamp: number }>;

      if (rows.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // Find similar queries
      const similar: Array<{ query: string; timestamp: number }> = [];

      for (const row of rows) {
        if (this.isSimilarQuery(currentQuery, row.query)) {
          similar.push(row);
        }
      }

      if (similar.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // Generate reminder
      const message = this.generateReminderMessage(similar);

      return {
        hasSimilar: true,
        message,
        similarQueries: similar.slice(0, 3), // Returns up to 3
      };
    } catch (error) {
      return { hasSimilar: false, message: '', similarQueries: [] };
    }
  }

  /**
   * Determine whether two queries are similar
   */
  private isSimilarQuery(query1: string, query2: string): boolean {
    // exactly the same
    if (query1 === query2) {
      return false; // The same query is not considered "similar" but is a duplicate
    }

    // Calculate similarity
    const words1 = new Set(this.extractWords(query1));
    const words2 = new Set(this.extractWords(query2));

    if (words1.size === 0 || words2.size === 0) {
      return false;
    }

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;

    return similarity > 0.4; // 40% similarity
  }

  /**
   * Extract words
   */
  private extractWords(text: string): string[] {
    const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    return [...chinese, ...english];
  }

  /**
   * Generate friendly reminders
   */
  private generateReminderMessage(similarQueries: Array<{ query: string; timestamp: number }>): string {
    if (similarQueries.length === 1) {
      const q = similarQueries[0].query;
      const preview = q.length > 20 ? q.slice(0, 20) + '...' : q;
      return `[corivo] 你之前也查过类似的："${preview}"`;
    }

    const previews = similarQueries
      .slice(0, 2)
      .map((s) => {
        const q = s.query;
        return q.length > 15 ? q.slice(0, 15) + '...' : q;
      });

    return `[corivo] 你之前也查过类似的：${previews.join('、')}`;
  }

  /**
   * Clean up old records (retain the last 30 days)
   */
  cleanupOldRecords(): void {
    try {
      const thirtyDaysAgo = this.runtime.clock.now() - 30 * 24 * 60 * 60 * 1000;
      const stmt = (this.db as any).db.prepare('DELETE FROM query_logs WHERE timestamp < ?');
      stmt.run(thirtyDaysAgo);
    } catch (error) {
      // Silently fails
    }
  }
}
