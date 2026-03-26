import { describe, it, expect, vi } from 'vitest';
import { applyPulledChangesets, createSyncLogger, post } from '../../src/cli/commands/sync';

describe('sync logging', () => {
  it('logLevel=debug 时记录 pull changeset 的过滤与写入细节', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createSyncLogger('debug', {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    });
    const db = {
      upsertBlock: vi.fn(),
    } as unknown as import('../../src/storage/database').CorivoDatabase;

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
    expect(logs.join('\n')).toContain('收到 2 条 pull changesets');
    expect(logs.join('\n')).toContain('准备写入 block=blk_remote_1');
    expect(logs.join('\n')).toContain('已跳过 changeset block=blk_skip');
    expect(logs.join('\n')).toContain('写入 block 成功 block=blk_remote_1');
  });

  it('写库失败时记录 block id 与 changeset 信息', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createSyncLogger('debug', {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    });
    const db = {
      upsertBlock: vi.fn(() => {
        throw new Error('SQLITE_CONSTRAINT');
      }),
    } as unknown as import('../../src/storage/database').CorivoDatabase;

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

    expect(logs.join('\n')).toContain('准备写入 block=blk_broken');
    expect(errors.join('\n')).toContain('写入 block 失败 block=blk_broken');
    expect(errors.join('\n')).toContain('dbVersion=99');
  });

  it('debug 请求日志会记录请求和响应摘要', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = createSyncLogger('debug', {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    });

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
        'token-123',
        logger,
        'pull'
      );

      expect(result).toEqual({ changesets: [], current_version: 3 });
      expect(errors).toEqual([]);
      expect(logs.join('\n')).toContain('[sync:pull] 请求');
      expect(logs.join('\n')).toContain('"since_version":2');
      expect(logs.join('\n')).toContain('[sync:pull] 响应 status=200');
      expect(logs.join('\n')).toContain('"current_version":3');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
