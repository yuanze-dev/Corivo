import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/utils/logging.js';

describe('createLogger', () => {
  it('debug 级别会输出 debug 日志', () => {
    const logs: string[] = [];
    const logger = createLogger(
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
    const logger = createLogger(
      {
        log: (message: string) => logs.push(message),
        error: () => {},
      },
      'info'
    );

    logger.debug('sync debug message');

    expect(logs).toEqual([]);
  });

  it('自动将未知级别归一化为 info', () => {
    const logs: string[] = [];
    const logger = createLogger(
      {
        log: (message: string) => logs.push(message),
        error: () => {},
      },
      'warn'
    );

    logger.debug('sync debug message');

    expect(logs).toEqual([]);
  });

  it('success 使用标准输出通道', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createLogger({
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    });

    logger.success('sync completed');

    expect(logs.join('\n')).toContain('sync completed');
    expect(errors).toEqual([]);
  });

  it('warn 使用错误输出通道', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createLogger({
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    });

    logger.warn('token expired');

    expect(logs).toEqual([]);
    expect(errors.join('\n')).toContain('token expired');
  });
});
