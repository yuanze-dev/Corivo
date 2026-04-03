import { Command } from 'commander';
import chalk from 'chalk';
import type { HostDoctorRequest } from '@/application/hosts/doctor-host';
import type { HostInstallRequest } from '@/application/hosts/install-host';
import type { HostUninstallRequest } from '@/application/hosts/uninstall-host';
import { hostImportCommand } from './host-import.js';
import type { HostDoctorResult, HostId, HostInstallResult } from '@/hosts';
import type { HostAdapter } from '@/hosts';

export interface HostCommandDeps {
  listHosts?: () => readonly HostAdapter[];
  installHost?: (input: HostInstallRequest) => Promise<HostInstallResult>;
  doctorHost?: (input: HostDoctorRequest) => Promise<HostDoctorResult>;
  uninstallHost?: (input: HostUninstallRequest) => Promise<HostInstallResult>;
  writeInfo?: (text: string) => void;
  writeError?: (text: string) => void;
  writeSuccess?: (text: string) => void;
  logger?: { debug: (...args: unknown[]) => void };
  hostImportCommand?: Command;
}

const defaultWrite = (text: string) => {
  console.log(text);
};

const missingInstallHost = async (_input: HostInstallRequest): Promise<HostInstallResult> => {
  throw new Error('host command requires injected installHost capability');
};

const missingDoctorHost = async (_input: HostDoctorRequest): Promise<HostDoctorResult> => {
  throw new Error('host command requires injected doctorHost capability');
};

const missingUninstallHost = async (_input: HostUninstallRequest): Promise<HostInstallResult> => {
  throw new Error('host command requires injected uninstallHost capability');
};

export function createHostCommand(deps: HostCommandDeps = {}): Command {
  const resolved = {
    listHosts: deps.listHosts ?? (() => [] as readonly HostAdapter[]),
    installHost: deps.installHost ?? missingInstallHost,
    doctorHost: deps.doctorHost ?? missingDoctorHost,
    uninstallHost: deps.uninstallHost ?? missingUninstallHost,
    writeInfo: deps.writeInfo ?? defaultWrite,
    writeError: deps.writeError ?? defaultWrite,
    writeSuccess: deps.writeSuccess ?? defaultWrite,
    logger: deps.logger ?? { debug: () => {} },
    hostImportCommand: deps.hostImportCommand ?? hostImportCommand,
  };
  const command = new Command('host');

  command.description('Manage Corivo host integrations');

  command
    .command('list')
    .description('List supported hosts')
    .action(() => {
      for (const adapter of resolved.listHosts()) {
        resolved.writeInfo(
          `${adapter.id}\t${adapter.displayName}\t${adapter.capabilities.join(',')}`
        );
      }
    });

  command
    .command('install')
    .description('Install a host integration')
    .argument('<host>', 'Host id')
    .option('-t, --target <path>', 'Target path')
    .option('-f, --force', 'Force install')
    .action(async (host: HostId, options: { target?: string; force?: boolean }) => {
      resolved.logger.debug(
        `[host:command] install host=${host} target=${options.target ?? '<default>'} force=${options.force === true}`
      );
      const result = await resolved.installHost({
        host,
        target: options.target,
        force: options.force,
      });

      if (!result.success) {
        resolved.writeError(chalk.red(result.error || result.summary));
        process.exitCode = 1;
        return;
      }

      resolved.writeSuccess(chalk.green(result.summary));
    });

  command
    .command('doctor')
    .description('Check a host integration')
    .argument('<host>', 'Host id')
    .option('-t, --target <path>', 'Target path')
    .action(async (host: HostId, options: { target?: string }) => {
      const result = await resolved.doctorHost({
        host,
        target: options.target,
      });

      for (const check of result.checks) {
        const marker = check.ok ? chalk.green('✔') : chalk.red('✖');
        resolved.writeInfo(`${marker} ${check.label}: ${check.detail}`);
      }

      if (!result.ok) {
        process.exitCode = 1;
      }
    });

  command
    .command('uninstall')
    .description('Uninstall a host integration')
    .argument('<host>', 'Host id')
    .option('-t, --target <path>', 'Target path')
    .action(async (host: HostId, options: { target?: string }) => {
      const result = await resolved.uninstallHost({
        host,
        target: options.target,
      });

      if (!result.success) {
        resolved.writeError(chalk.red(result.error || result.summary));
        process.exitCode = 1;
        return;
      }

      resolved.writeSuccess(chalk.green(result.summary));
    });

  command.addCommand(resolved.hostImportCommand);

  return command;
}

export const hostCommand = createHostCommand();
