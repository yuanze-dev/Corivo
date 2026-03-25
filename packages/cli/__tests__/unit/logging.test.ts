import { describe, expect, it } from 'vitest';
import { formatLogLine } from '../../src/utils/logging.js';

describe('formatLogLine', () => {
  it('prefixes log messages with a local timestamp', () => {
    const date = new Date(2026, 2, 26, 9, 2, 3);

    expect(formatLogLine(['[corivo] 后台心跳启动中...'], date)).toBe(
      '[2026-03-26 09:02:03] [corivo] 后台心跳启动中...'
    );
  });

  it('formats multiple console arguments into one line', () => {
    const date = new Date(2026, 2, 26, 9, 2, 3);

    expect(formatLogLine(['[心跳] 自动同步失败:', { message: 'boom' }], date)).toBe(
      '[2026-03-26 09:02:03] [心跳] 自动同步失败: {"message":"boom"}'
    );
  });
});
