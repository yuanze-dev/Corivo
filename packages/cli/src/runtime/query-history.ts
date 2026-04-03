import type { CorivoDatabase } from '../storage/database.js';
import type { Logger } from '../utils/logging.js';
import { QueryHistoryTracker } from '../engine/query-history.js';
import {
  createSqlQueryHistoryStore,
  type QueryHistorySqlDb,
  type QueryHistoryStore,
} from './query-history-store.js';

function extractSqliteDb(db: CorivoDatabase): QueryHistorySqlDb {
  const candidate = Reflect.get(db as object, 'db');
  if (!candidate || typeof candidate !== 'object' || typeof Reflect.get(candidate, 'prepare') !== 'function') {
    throw new Error('CorivoDatabase does not expose a compatible query history SQL adapter');
  }
  return candidate as QueryHistorySqlDb;
}

export function createRuntimeQueryHistoryStore(db: CorivoDatabase): QueryHistoryStore {
  return createSqlQueryHistoryStore(extractSqliteDb(db));
}

export function createRuntimeQueryHistoryTracker(
  store: QueryHistoryStore,
  runtime: {
    logger: Pick<Logger, 'debug'>;
    clock: { now(): number };
  },
): QueryHistoryTracker {
  return new QueryHistoryTracker(store, runtime);
}
