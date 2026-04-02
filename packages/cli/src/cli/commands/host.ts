import { Command } from 'commander';
import chalk from 'chalk';
import { createHostDoctorUseCase } from '../../application/hosts/doctor-host.js';
import { createHostInstallUseCase } from '../../application/hosts/install-host.js';
import { createHostUninstallUseCase } from '../../application/hosts/uninstall-host.js';
import { hostImportCommand } from './host-import.js';
import { getAllHostAdapters } from '../../hosts/registry.js';
import type { HostId } from '../../hosts/types.js';
import { createCliContext } from '../context/create-context.js';
import { createConfiguredCliContext } from '../context/configured-context.js';

export const hostCommand = new Command('host');

hostCommand.description('Manage Corivo host integrations');

hostCommand
  .command('list')
  .description('List supported hosts')
  .action(() => {
    const context = createCliContext();
    for (const adapter of getAllHostAdapters()) {
      context.output.info(`${adapter.id}\t${adapter.displayName}\t${adapter.capabilities.join(',')}`);
    }
  });

hostCommand
  .command('install')
  .description('Install a host integration')
  .argument('<host>', 'Host id')
  .option('-t, --target <path>', 'Target path')
  .option('-f, --force', 'Force install')
  .action(async (host: HostId, options: { target?: string; force?: boolean }) => {
    const bootstrapContext = createCliContext();
    const config = await bootstrapContext.config.load();
    const context = createConfiguredCliContext(config);
    const installHost = createHostInstallUseCase({ logger: context.logger });
    const result = await installHost({ host, target: options.target, force: options.force });

    if (!result.success) {
      context.output.error(chalk.red(result.error || result.summary));
      process.exitCode = 1;
      return;
    }

    context.output.success(chalk.green(result.summary));
  });

hostCommand
  .command('doctor')
  .description('Check a host integration')
  .argument('<host>', 'Host id')
  .option('-t, --target <path>', 'Target path')
  .action(async (host: HostId, options: { target?: string }) => {
    const bootstrapContext = createCliContext();
    const config = await bootstrapContext.config.load();
    const context = createConfiguredCliContext(config);
    const doctorHost = createHostDoctorUseCase();
    const result = await doctorHost({ host, target: options.target });

    for (const check of result.checks) {
      const marker = check.ok ? chalk.green('✔') : chalk.red('✖');
      context.output.info(`${marker} ${check.label}: ${check.detail}`);
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  });

hostCommand
  .command('uninstall')
  .description('Uninstall a host integration')
  .argument('<host>', 'Host id')
  .option('-t, --target <path>', 'Target path')
  .action(async (host: HostId, options: { target?: string }) => {
    const bootstrapContext = createCliContext();
    const config = await bootstrapContext.config.load();
    const context = createConfiguredCliContext(config);
    const uninstallHost = createHostUninstallUseCase();
    const result = await uninstallHost({ host, target: options.target });

    if (!result.success) {
      context.output.error(chalk.red(result.error || result.summary));
      process.exitCode = 1;
      return;
    }

    context.output.success(chalk.green(result.summary));
  });

hostCommand.addCommand(hostImportCommand);
