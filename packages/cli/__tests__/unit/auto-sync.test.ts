/**
 * Unit tests for AutoSync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoSync } from '../../src/runtime/scheduling/auto-sync.js';
import type { Logger } from '../../src/infrastructure/logging.js';

// Utility functions for the mocked sync runtime seam
vi.mock('../../src/runtime/sync-client.js', () => ({
  authenticate: vi.fn(),
  post: vi.fn(),
  applyPulledChangesets: vi.fn((db: { upsertBlock: (input: { id: string; content: string }) => void }, changesets: Array<{ table_name: string; pk: string; col_name: string | null; value: string | null }>) => {
    let applied = 0;
    for (const cs of changesets) {
      if (cs.table_name === 'blocks' && cs.col_name === 'content' && cs.value != null) {
        db.upsertBlock({ id: cs.pk, content: cs.value });
        applied++;
      }
    }
    return applied;
  }),
}));

import { authenticate, post } from '../../src/runtime/sync-client.js';

const mockAuthenticate = authenticate as ReturnType<typeof vi.fn>;
const mockPost = post as ReturnType<typeof vi.fn>;

// Mock CorivoDatabase
const mockDb = {
  queryBlocks: vi.fn().mockReturnValue([]),
  getBlock: vi.fn(),
  upsertBlock: vi.fn(),
} as unknown as import('@/infrastructure/storage/facade/database').CorivoDatabase;

const defaultConfig = {
  version: '1',
  created_at: '2026-01-01',
  identity_id: 'test-identity-id',
};

const defaultSolverConfig = {
  server_url: 'http://localhost:3141',
  shared_secret: 'secret',
  site_id: 'site-abc',
  last_push_version: 0,
  last_pull_version: 0,
};

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

describe('AutoSync', () => {
  let autoSync: AutoSync;
  let logs: string[];
  let errors: string[];
  let now: number;
  let runtime: {
    logger: Logger;
    loadConfig: typeof mockLoadConfig;
    loadSolver: typeof mockLoadSolverConfig;
    saveSolver: typeof mockSaveSolverConfig;
    now: () => number;
  };
  const mockLoadConfig = vi.fn();
  const mockLoadSolverConfig = vi.fn();
  const mockSaveSolverConfig = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    errors = [];
    now = Date.now();
    runtime = {
      logger: createMockLogger(logs, errors),
      loadConfig: mockLoadConfig,
      loadSolver: mockLoadSolverConfig,
      saveSolver: mockSaveSolverConfig,
      now: () => now,
    };
    autoSync = new AutoSync(mockDb, runtime);
    mockAuthenticate.mockResolvedValue('mock-token');
    mockPost.mockResolvedValue({ stored: 0, changesets: [], current_version: 0 });
  });

  describe('run() - 配置检查', () => {
    it('config.json 缺失时返回 null，不发起 HTTP 请求', async () => {
      mockLoadConfig.mockResolvedValue(null);

      const result = await autoSync.run();

      expect(result).toBeNull();
      expect(mockAuthenticate).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('solver.json 缺失时返回 null，不发起 HTTP 请求', async () => {
      mockLoadConfig.mockResolvedValue(defaultConfig);
      mockLoadSolverConfig.mockResolvedValue(null);

      const result = await autoSync.run();

      expect(result).toBeNull();
      expect(mockAuthenticate).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('run() - 正常同步', () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue(defaultConfig);
      mockLoadSolverConfig.mockResolvedValue({ ...defaultSolverConfig });
    });

    it('使用注入 logger 输出同步阶段日志', async () => {
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
      mockPost.mockResolvedValue({ changesets: [], current_version: 5 });

      await autoSync.run();

      expect(logs.join('\n')).toContain('[sync:auto] 开始同步');
      expect(logs.join('\n')).toContain('[sync:auto] pull 完成');
      expect(logs.join('\n')).toContain('currentVersion=5');
      expect(errors).toEqual([]);
    });

    it('无 blocks 时 push 0 条，返回计数', async () => {
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
      mockPost.mockResolvedValue({ changesets: [], current_version: 5 });

      const result = await autoSync.run();

      expect(result).not.toBeNull();
      expect(result?.pushed).toBe(0);
      expect(result?.pulled).toBe(0);
    });

    it('有 blocks 时执行认证 → push → pull，返回正确计数', async () => {
      const blocks = [
        { id: 'blk_1', content: '内容1' },
        { id: 'blk_2', content: '内容2' },
      ];
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue(blocks);

      // push response
      mockPost
        .mockResolvedValueOnce({ stored: 2 })        // push
        .mockResolvedValueOnce({
          changesets: [
            {
              table_name: 'blocks',
              pk: 'blk_remote_1',
              col_name: 'content',
              value: '远端内容',
            },
          ],
          current_version: 1,
        }); // pull

      const result = await autoSync.run();

      expect(mockAuthenticate).toHaveBeenCalledWith(
        'http://localhost:3141',
        'test-identity-id',
        'secret',
        expect.objectContaining({
          debug: expect.any(Function),
          error: expect.any(Function),
          log: expect.any(Function),
        })
      );
      expect(result?.pushed).toBe(2);
      expect(result?.pulled).toBe(1);
    });

    it('pull 后更新 last_pull_version', async () => {
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
      mockPost.mockResolvedValue({ changesets: [], current_version: 10 });

      await autoSync.run();

      expect(mockSaveSolverConfig).toHaveBeenCalledWith(
        expect.objectContaining({ last_pull_version: 10 })
      );
    });

    it('pull 到 blocks changeset 时写入本地数据库', async () => {
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (mockDb.getBlock as ReturnType<typeof vi.fn>).mockReturnValue(null);
      mockPost.mockResolvedValue({
        changesets: [
          {
            table_name: 'blocks',
            pk: 'blk_remote_1',
            col_name: 'content',
            value: '远端记忆',
            db_version: 1,
            site_id: 'remote-site',
          },
        ],
        current_version: 1,
      });

      await autoSync.run();

      expect(mockDb.upsertBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'blk_remote_1',
          content: '远端记忆',
        })
      );
    });
  });

  describe('Token 缓存', () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue(defaultConfig);
      mockLoadSolverConfig.mockResolvedValue({ ...defaultSolverConfig });
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
      mockPost.mockResolvedValue({ changesets: [], current_version: 0 });
    });

    it('连续两次 run() 只认证一次', async () => {
      await autoSync.run();
      await autoSync.run();

      expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    });

    it('token 过期后重新认证', async () => {
      await autoSync.run();
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);

      now += 5 * 60 * 1000;

      await autoSync.run();
      expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理', () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue(defaultConfig);
      mockLoadSolverConfig.mockResolvedValue({ ...defaultSolverConfig });
      (mockDb.queryBlocks as ReturnType<typeof vi.fn>).mockReturnValue([]);
    });

    it('网络错误时返回 null，不抛异常', async () => {
      mockPost.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(autoSync.run()).resolves.toBeNull();
      expect(errors.join('\n')).toContain('[sync:auto] 同步失败:');
    });

    it('401 认证失败后清除 token 缓存', async () => {
      // First let authenticate return a token
      mockAuthenticate.mockResolvedValue('old-token');
      mockPost.mockResolvedValue({ changesets: [], current_version: 0 });
      await autoSync.run();
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);

      // Next post returns 401
      mockPost.mockRejectedValue(new Error('HTTP 401: Unauthorized'));

      await autoSync.run();

      // The token has been cleared and will be re-authenticated next time.
      mockPost.mockResolvedValue({ changesets: [], current_version: 0 });
      await autoSync.run();
      // The 1st successful authentication + the 3rd time (re-authentication after the token is cleared) = 2 times
      expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    });
  });
});
