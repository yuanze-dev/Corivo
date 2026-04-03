import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  readFile,
  getInstance,
  getServiceManager,
  loadConfig,
  loadSolverConfig,
  outputInfo,
  saveSolverConfig,
  pushNeedsAttention,
} = vi.hoisted(() => ({
  readFile: vi.fn(),
  getInstance: vi.fn(),
  getServiceManager: vi.fn(),
  loadConfig: vi.fn(),
  loadSolverConfig: vi.fn(),
  outputInfo: vi.fn(),
  saveSolverConfig: vi.fn(),
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
  loadConfig,
  loadSolverConfig,
  saveSolverConfig,
}));

vi.mock('@/infrastructure/platform/index.js', () => ({
  getServiceManager,
}));

vi.mock('@/push/context.js', () => ({
  ContextPusher: class {
    pushNeedsAttention = pushNeedsAttention;
  },
}));

vi.mock('../../src/cli/runtime.js', () => ({
  getCliOutput: () => ({
    info: outputInfo,
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
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
    loadConfig.mockResolvedValue({ version: '0.12.6' });
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
    const { statusCommand } = await import('../../src/cli/commands/status.js');

    await statusCommand({ json: true });

    expect(outputInfo).toHaveBeenCalledTimes(1);
    expect(JSON.parse(outputInfo.mock.calls[0]?.[0] as string)).toEqual({
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
  });
});

describe('trial command constructors', () => {
  it('host command delegates to injected capabilities', async () => {
    const listHosts = vi.fn(() => [
      { id: 'codex', displayName: 'Codex', capabilities: ['inject'] },
    ]);
    const installHost = vi.fn(async () => ({ success: true, host: 'codex', summary: 'installed' }));
    const doctorHost = vi.fn(async () => ({ ok: true, host: 'codex', checks: [] }));
    const uninstallHost = vi.fn(async () => ({ success: true, host: 'codex', summary: 'removed' }));
    const writeInfo = vi.fn();
    const writeError = vi.fn();
    const writeSuccess = vi.fn();
    const logger = { debug: vi.fn() };
    const { createHostCommand } = await import('../../src/cli/commands/host.js');

    const command = createHostCommand({
      listHosts,
      installHost,
      doctorHost,
      uninstallHost,
      writeInfo,
      writeError,
      writeSuccess,
      logger,
      hostImportCommand: new Command('import'),
    });

    await command.parseAsync(['list'], { from: 'user' });
    await command.parseAsync(['install', 'codex'], { from: 'user' });
    await command.parseAsync(['doctor', 'codex'], { from: 'user' });
    await command.parseAsync(['uninstall', 'codex'], { from: 'user' });

    expect(listHosts).toHaveBeenCalledTimes(1);
    expect(installHost).toHaveBeenCalledWith({ host: 'codex', target: undefined, force: undefined });
    expect(doctorHost).toHaveBeenCalledWith({ host: 'codex', target: undefined });
    expect(uninstallHost).toHaveBeenCalledWith({ host: 'codex', target: undefined });
    expect(writeInfo).toHaveBeenCalled();
  });

  it('query command delegates to injected prompt/search executors', async () => {
    const runPromptQuery = vi.fn(async () => '[corivo] prompt result');
    const runSearchQuery = vi.fn(async () => {});
    const writeOutput = vi.fn();
    const logger = { debug: vi.fn() };
    const { createQueryCommand } = await import('../../src/cli/commands/query.js');
    const promptCommand = createQueryCommand({ runPromptQuery, runSearchQuery, writeOutput, logger });
    const promptProgram = new Command();
    promptProgram.addCommand(promptCommand);

    await promptProgram.parseAsync(['node', 'corivo', 'query', '--prompt', 'hello']);

    const searchCommand = createQueryCommand({ runPromptQuery, runSearchQuery, writeOutput, logger });
    const searchProgram = new Command();
    searchProgram.addCommand(searchCommand);
    await searchProgram.parseAsync(['node', 'corivo', 'query', 'sqlite']);

    expect(runPromptQuery).toHaveBeenCalledWith({
      password: false,
      format: 'text',
      prompt: 'hello',
    });
    expect(runSearchQuery).toHaveBeenCalledWith({
      query: 'sqlite',
      options: { format: 'text' },
    });
    expect(writeOutput).toHaveBeenCalledWith('[corivo] prompt result');
  });

  it('daemon command delegates run behavior to injected executor', async () => {
    const runDaemon = vi.fn(async () => {});
    const logger = { log: vi.fn(), error: vi.fn() };
    const { createDaemonCommand } = await import('../../src/cli/commands/daemon.js');
    const command = createDaemonCommand({ runDaemon, logger });

    await command.parseAsync(['run'], { from: 'user' });
    expect(runDaemon).toHaveBeenCalledTimes(1);
  });
});
