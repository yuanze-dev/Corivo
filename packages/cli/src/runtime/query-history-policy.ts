export interface QueryHistoryPolicy {
  similarityWindowMs: number;
  retentionWindowMs: number;
  recentQueryLimit: number;
  reminderOutputLimit: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_QUERY_HISTORY_POLICY: QueryHistoryPolicy = {
  similarityWindowMs: 7 * DAY_MS,
  retentionWindowMs: 30 * DAY_MS,
  recentQueryLimit: 50,
  reminderOutputLimit: 3,
};
