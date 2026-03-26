import { describe, expect, it } from 'vitest';
import { createTimestampLogger } from '../../src/utils/logging';

describe('createTimestampLogger', () => {
  it('debug 级别会输出 debug 日志', () => {
    const logs: string[] = [];
    const logger = createTimestampLogger(
      {
        log: (message: string) => logs.push(message),
        error: () => {},
      },
      'debug'
    );

    logger.debug('sync debug message');

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('sync debug message');
  });

  it('info 级别不会输出 debug 日志', () => {
    const logs: string[] = [];
    const logger = createTimestampLogger(
      {
        log: (message: string) => logs.push(message),
        error: () => {},
      },
      'info'
    );

    logger.debug('sync debug message');

    expect(logs).toEqual([]);
  });
});
