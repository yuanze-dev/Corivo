import { describe, expect, it, vi } from 'vitest';
import { createHostDoctorUseCase } from '../../src/application/hosts/doctor-host.js';
import { createHostInstallUseCase } from '../../src/application/hosts/install-host.js';
import { createHostUninstallUseCase } from '../../src/application/hosts/uninstall-host.js';
import { hostCommand } from '../../src/cli/commands/host.js';

describe('host command', () => {
  it('registers list, install, doctor, and uninstall subcommands', () => {
    expect(hostCommand.commands.map((command) => command.name())).toEqual([
      'list',
      'install',
      'doctor',
      'uninstall',
    ]);
  });

  it('routes install requests through the install use case', async () => {
    const run = vi.fn().mockResolvedValue({
      success: true,
      host: 'codex',
      summary: 'ok',
    });
    const useCase = createHostInstallUseCase({ run });

    await useCase({ host: 'codex' });

    expect(run).toHaveBeenCalledWith({ host: 'codex' });
  });

  it('routes doctor requests through the doctor use case', async () => {
    const run = vi.fn().mockResolvedValue({
      ok: true,
      host: 'cursor',
      checks: [],
    });
    const useCase = createHostDoctorUseCase({ run });

    await useCase({ host: 'cursor' });

    expect(run).toHaveBeenCalledWith({ host: 'cursor' });
  });

  it('routes uninstall requests through the uninstall use case', async () => {
    const run = vi.fn().mockResolvedValue({
      success: true,
      host: 'opencode',
      summary: 'removed',
    });
    const useCase = createHostUninstallUseCase({ run });

    await useCase({ host: 'opencode' });

    expect(run).toHaveBeenCalledWith({ host: 'opencode' });
  });
});
