import { describe, it, expect, vi } from 'vitest';
import { applyPulledChangesets, post } from '../../src/cli/commands/sync.js';
import type { Logger } from '../../src/utils/logging.js';

function createMockLogger(logs: string[], errors: string[]): Logger {
  return {
    log: (message: string) => logs.push(message),
    info: (message: string) => logs.push(message),
    success: (message: string) => logs.push(message),
    warn: (message: string) => errors.push(message),
    error: (message: string) => errors.push(message),
    debug: (message: string) => logs.push(message),
    isDebugEnabled: () => true,
  };
}

describe('sync logging', () => {
  it('logLevel=debug 时记录 pull changeset 的过滤与写入细节', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createMockLogger(logs, errors);
    const db = {
      upsertBlock: vi.fn(),
    } as unknown as import('../../src/storage/database.js').CorivoDatabase;

    const applied = applyPulledChangesets(
      db,
      [
        {
          table_name: 'blocks',
          pk: 'blk_remote_1',
          col_name: 'content',
          value: '远端内容',
          db_version: 12,
          site_id: 'remote-site',
        },
        {
          table_name: 'blocks',
          pk: 'blk_skip',
          col_name: 'annotation',
          value: 'pending',
          db_version: 13,
          site_id: 'remote-site',
        },
      ],
      logger
    );

    expect(applied).toBe(1);
    expect(errors).toEqual([]);
    expect(logs.join('\n')).toContain('received 2 pull changesets');
    expect(logs.join('\n')).toContain('preparing to write block=blk_remote_1');
    expect(logs.join('\n')).toContain('skipped changeset block=blk_skip');
    expect(logs.join('\n')).toContain('wrote block successfully block=blk_remote_1');
  });

  it('写库失败时记录 block id 与 changeset 信息', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createMockLogger(logs, errors);
    const db = {
      upsertBlock: vi.fn(() => {
        throw new Error('SQLITE_CONSTRAINT');
      }),
    } as unknown as import('../../src/storage/database.js').CorivoDatabase;

    expect(() =>
      applyPulledChangesets(
        db,
        [
          {
            table_name: 'blocks',
            pk: 'blk_broken',
            col_name: 'content',
            value: '远端内容',
            db_version: 99,
            site_id: 'remote-site',
          },
        ],
        logger
      )
    ).toThrow('SQLITE_CONSTRAINT');

    expect(logs.join('\n')).toContain('preparing to write block=blk_broken');
    expect(errors.join('\n')).toContain('failed to write block=blk_broken');
    expect(errors.join('\n')).toContain('dbVersion=99');
  });

  it('debug 请求日志会记录请求和响应摘要', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createMockLogger(logs, errors);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ changesets: [], current_version: 3 }),
    });

    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await post(
        'http://localhost:3141/sync/pull',
        { site_id: 'site-abc', since_version: 2 },
        logger,
        'token-123',
        'pull'
      );

      expect(result).toEqual({ changesets: [], current_version: 3 });
      expect(errors).toEqual([]);
      expect(logs.join('\n')).toContain('[sync:pull] request');
      expect(logs.join('\n')).toContain('"since_version":2');
      expect(logs.join('\n')).toContain('[sync:pull] response status=200');
      expect(logs.join('\n')).toContain('"current_version":3');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
