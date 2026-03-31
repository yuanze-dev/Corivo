import { beforeEach, describe, expect, it, vi } from 'vitest';

const { installHostRun, uninstallHostRun, printBanner } = vi.hoisted(() => ({
  installHostRun: vi.fn(),
  uninstallHostRun: vi.fn(),
  printBanner: vi.fn(),
}));

vi.mock('../../src/application/hosts/install-host.js', () => ({
  createHostInstallUseCase: vi.fn(() => installHostRun),
}));

vi.mock('../../src/application/hosts/uninstall-host.js', () => ({
  createHostUninstallUseCase: vi.fn(() => uninstallHostRun),
}));

vi.mock('@/utils/banner', () => ({
  printBanner,
}));

import { injectCommand } from '../../src/cli/commands/inject.js';

describe('inject command compatibility routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installHostRun.mockResolvedValue({
      success: true,
      host: 'project-claude',
      summary: 'ok',
      path: '/tmp/CLAUDE.md',
    });
    uninstallHostRun.mockResolvedValue({
      success: true,
      host: 'project-claude',
      summary: 'removed',
      path: '/tmp/CLAUDE.md',
    });
  });

  it.each([
    [{ global: true, codex: true }, 'codex'],
    [{ global: true, cursor: true }, 'cursor'],
    [{ global: true, opencode: true }, 'opencode'],
    [{ global: true, claudeCode: true }, 'claude-code'],
  ] as const)('routes legacy global flags %o through host install', async (options, host) => {
    await injectCommand(options);

    expect(installHostRun).toHaveBeenCalledWith(expect.objectContaining({ host, global: true }));
  });

  it('routes default inject to project-claude install use case', async () => {
    await injectCommand({});

    expect(installHostRun).toHaveBeenCalledWith(expect.objectContaining({ host: 'project-claude' }));
  });

  it('routes --force on default project-claude path through install use case', async () => {
    await injectCommand({ force: true });

    expect(installHostRun).toHaveBeenCalledWith(expect.objectContaining({ host: 'project-claude', force: true }));
  });

  it('keeps default global project-claude target unresolved for helper fallback', async () => {
    await injectCommand({ global: true });

    const call = installHostRun.mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({ host: 'project-claude', global: true });
    expect(call?.target).toBeUndefined();
  });

  it('routes default --eject to project-claude uninstall use case', async () => {
    await injectCommand({ eject: true });

    expect(uninstallHostRun).toHaveBeenCalledWith(expect.objectContaining({ host: 'project-claude' }));
  });

  it('routes host-specific --eject through uninstall use case', async () => {
    await injectCommand({ global: true, codex: true, eject: true });

    expect(uninstallHostRun).toHaveBeenCalledWith(expect.objectContaining({ host: 'codex', global: true }));
  });
});
