/**
 * Query history tracker
 *
 * Record the user's query for "You have also checked similar queries before" reminder
 */

import type { Block } from '@/domain/memory/models/index.js';
import { generateBlockId } from '@/domain/memory/models/block.js';
import {
  buildSimilarQueryReminder,
  isSimilarQuery,
  type SimilarQueryRecord,
} from '@/runtime/query-pack.js';
import {
  DEFAULT_QUERY_HISTORY_POLICY,
  type QueryHistoryPolicy,
} from '@/runtime/query-history-policy.js';
import {
  type QueryHistoryStore,
} from '@/runtime/query-history-store.js';
import type { Logger } from '@/utils/logging.js';

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
  similarQueries: SimilarQueryRecord[];
}

/**
 * Query history tracker
 */
export class QueryHistoryTracker {
  private static readonly NOOP_DEBUG_LOGGER: Pick<Logger, 'debug'> = {
    debug: () => undefined,
  };

  private readonly runtime: QueryHistoryRuntime;
  private readonly policy: QueryHistoryPolicy;

  constructor(
    private readonly store: QueryHistoryStore,
    runtime?: Partial<QueryHistoryRuntime>,
    policy?: Partial<QueryHistoryPolicy>,
  ) {
    this.runtime = {
      logger: runtime?.logger ?? QueryHistoryTracker.NOOP_DEBUG_LOGGER,
      clock: runtime?.clock ?? { now: () => Date.now() },
    };
    this.policy = {
      ...DEFAULT_QUERY_HISTORY_POLICY,
      ...policy,
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
      this.store.save(record);
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
      const sevenDaysAgo = this.runtime.clock.now() - this.policy.similarityWindowMs;
      const rows = this.store.listRecent({
        sinceTimestamp: sevenDaysAgo,
        limit: this.policy.recentQueryLimit,
      }) as SimilarQueryRecord[];

      if (rows.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // Find similar queries
      const similar: SimilarQueryRecord[] = [];

      for (const row of rows) {
        if (isSimilarQuery(currentQuery, row.query)) {
          similar.push(row);
        }
      }

      if (similar.length === 0) {
        return { hasSimilar: false, message: '', similarQueries: [] };
      }

      // Generate reminder
      const message = buildSimilarQueryReminder(similar);

      return {
        hasSimilar: true,
        message,
        similarQueries: similar.slice(0, this.policy.reminderOutputLimit),
      };
    } catch (error) {
      return { hasSimilar: false, message: '', similarQueries: [] };
    }
  }

  /**
   * Clean up old records (retain the last 30 days)
   */
  cleanupOldRecords(): void {
    try {
      const thirtyDaysAgo = this.runtime.clock.now() - this.policy.retentionWindowMs;
      this.store.purgeBefore(thirtyDaysAgo);
    } catch (error) {
      // Silently fails
    }
  }
}
