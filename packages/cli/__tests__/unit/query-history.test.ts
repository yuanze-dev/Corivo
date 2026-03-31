import { describe, expect, it, vi } from 'vitest';
import { QueryHistoryTracker } from '../../src/engine/query-history.js';
import type { Logger } from '../../src/utils/logging.js';

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
    const db = {
      db: {
        prepare: vi.fn(() => {
          throw new Error('missing query_logs table');
        }),
      },
    } as unknown as import('../../src/storage/database.js').CorivoDatabase;

    const tracker = new QueryHistoryTracker(db, {
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
