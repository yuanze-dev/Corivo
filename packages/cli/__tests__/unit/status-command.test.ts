import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readFile,
  getInstance,
  getServiceManager,
  loadSolverConfig,
  pushNeedsAttention,
} = vi.hoisted(() => ({
  readFile: vi.fn(),
  getInstance: vi.fn(),
  getServiceManager: vi.fn(),
  loadSolverConfig: vi.fn(),
  pushNeedsAttention: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile,
  },
}));

vi.mock('@/storage/database', () => ({
  CorivoDatabase: {
    getInstance,
  },
  getDefaultDatabasePath: () => '/tmp/test-home/.corivo/corivo.db',
  getConfigDir: () => '/tmp/test-home/.corivo',
}));

vi.mock('@/config', () => ({
  loadSolverConfig,
}));

vi.mock('@/service/index.js', () => ({
  getServiceManager,
}));

vi.mock('@/push/context.js', () => ({
  ContextPusher: class {
    pushNeedsAttention = pushNeedsAttention;
  },
}));

describe('statusCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readFile.mockResolvedValue(JSON.stringify({ version: '0.12.6' }));
    getInstance.mockReturnValue({
      getStats: () => ({
        total: 5,
        byStatus: {
          active: 3,
          cooling: 1,
          cold: 1,
        },
        byAnnotation: {
          '决策 · project · database': 2,
          '事实 · self · preference': 1,
        },
      }),
      checkHealth: () => ({
        ok: true,
        integrity: 'ok',
        size: 2048,
        path: '/tmp/test-home/.corivo/corivo.db',
        blockCount: 5,
      }),
      getEncryptionInfo: () => ({
        enabled: false,
        method: 'none',
      }),
    });
    getServiceManager.mockReturnValue({
      getStatus: vi.fn().mockResolvedValue({
        loaded: true,
        running: true,
        pid: 4321,
      }),
    });
    loadSolverConfig.mockResolvedValue({
      server_url: 'https://solver.example.com',
      shared_secret: 'secret',
      site_id: 'site-1',
      last_push_version: 12,
      last_pull_version: 9,
    });
    pushNeedsAttention.mockResolvedValue('--- attention ---');
  });

  it('prints legacy status data as structured json', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { statusCommand } = await import('../../src/cli/commands/status.js');

    await statusCommand({ json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0]?.[0] as string)).toEqual({
      memory: {
        total: 5,
        byStatus: {
          active: 3,
          cooling: 1,
          cold: 1,
        },
        byAnnotation: {
          '决策 · project · database': 2,
          '事实 · self · preference': 1,
        },
      },
      database: {
        path: '/tmp/test-home/.corivo/corivo.db',
        healthy: true,
        integrity: 'ok',
        sizeBytes: 2048,
        blockCount: 5,
        encryption: {
          enabled: false,
          method: 'none',
        },
      },
      daemon: {
        loaded: true,
        running: true,
        pid: 4321,
      },
      sync: {
        configured: true,
        serverUrl: 'https://solver.example.com',
        lastPushVersion: 12,
        lastPullVersion: 9,
      },
      attention: {
        message: '--- attention ---',
      },
      nextSteps: [
        'corivo save --content "..." --annotation "..."',
        'corivo save --pending --content "..."',
        'corivo query "..."',
        'corivo start | stop',
      ],
    });

    logSpy.mockRestore();
  });
});
