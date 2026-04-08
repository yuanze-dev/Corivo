import { describe, expect, it, vi } from 'vitest';
import { QueryHistoryTracker } from '../../src/domain/memory/services/query-history.js';
import type { QueryHistoryStore } from '../../src/runtime/query-history-store.js';
import type { Logger } from '../../src/infrastructure/logging.js';

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isDebugEnabled: () => true,
  };
}

describe('QueryHistoryTracker', () => {
  it('logs query persistence failures through the injected logger facade', () => {
    const logger = createMockLogger();
    const store: QueryHistoryStore = {
      save: vi.fn(() => {
        throw new Error('missing query_logs table');
      }),
      listRecent: vi.fn(() => []),
      purgeBefore: vi.fn(),
    };

    const tracker = new QueryHistoryTracker(store, {
      logger,
      clock: { now: () => 1234567890 },
    });

    tracker.recordQuery('react', []);

    expect(logger.debug).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[query-history] 记录查询失败:')
    );
  });
});
