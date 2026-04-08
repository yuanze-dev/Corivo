/**
 * Update command - manual update check and installation.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { printBanner } from '@/cli/presenters/banner.js';
import {
  checkForUpdate,
  performUpdate,
  getPlatform,
  getUpdateRecord,
  getCurrentVersion,
  fetchVersionInfo,
} from '@/infrastructure/update/checker.js';
import type { UpdateConfig } from '@/infrastructure/update/types.js';
import { getCliOutput } from '@/cli/runtime';

export const updateCommand = new Command('update');

updateCommand
  .description('Manually check for and install updates')
  .option('--check', 'Only check for updates, do not install')
  .action(async (options) => {
    await handleUpdateCommand(options);
  });

updateCommand
  .command('check')
  .description('Check whether a new version is available')
  .action(async () => {
    await checkUpdates();
  });

updateCommand
  .command('status')
  .description('View update status')
  .action(async () => {
    await showUpdateStatus();
  });

async function handleUpdateCommand(options: { check?: boolean }) {
  const output = getCliOutput();
  printBanner('Corivo Update', { color: chalk.cyan });

  const currentVersion = getCurrentVersion();
  output.info(`Current version: ${currentVersion}`);
  output.info('');

  // Check for updates
  output.info('Checking for updates...');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    output.warn(chalk.yellow('Unable to connect to the update server'));
    output.info('');
    return;
  }

  if (!status.hasUpdate) {
    output.success(chalk.green('Already on the latest version'));
    output.info('');
    return;
  }

  output.info('');
  output.success(chalk.green(`New version available: ${status.latestVersion}`));

  if (status.isBreaking) {
    output.warn(chalk.yellow('Note: this update contains breaking changes'));
  }

  // If you just check, don’t install
  if (options.check) {
    output.info('');
    output.info('To install the update, run: corivo update');
    output.info('');
    return;
  }

  // Breaking updates require confirmation
  if (status.isBreaking) {
    output.info('');
    output.warn(chalk.yellow('Breaking updates require manual confirmation'));
    output.info('Please review the changelog before updating');
    output.info('');
    return;
  }

  // perform update
  output.info('');
  output.info('Downloading update...');

  const versionInfo = await fetchVersionInfo();
  if (!versionInfo) {
    output.error(chalk.red('Failed to fetch update information'));
    output.info('');
    return;
  }

  const result = await performUpdate(versionInfo, getPlatform());

  if (result.success) {
    output.success(chalk.green('✔ Update successful'));
    output.info('');
    output.info(`Version: ${currentVersion} -> ${versionInfo.version}`);
    output.info('');
    output.info('The new version will be used on the next CLI invocation');
    output.info('');
  } else {
    output.error(chalk.red('✖ Update failed:'), result.error);
    output.info('');
  }
}

async function checkUpdates() {
  const output = getCliOutput();
  output.info('');
  output.info(chalk.cyan('Corivo Version Check'));
  output.info('');

  const currentVersion = getCurrentVersion();
  output.info(`Current version: ${currentVersion}`);
  output.info('');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    output.warn(chalk.yellow('Unable to connect to the update server'));
    output.info('');
    return;
  }

  output.info(`Latest version: ${status.latestVersion}`);
  output.info('');

  if (status.hasUpdate) {
    output.success(chalk.green('An update is available'));

    const record = await getUpdateRecord();
    if (record && record.to !== status.latestVersion) {
      output.info(`Recent update: ${record.from} -> ${record.to}`);
    }
  } else {
    output.info(chalk.gray('Already on the latest version'));
  }

  output.info('');
}

async function showUpdateStatus() {
  const output = getCliOutput();
  output.info('');
  output.info(chalk.cyan('Corivo Update Status'));
  output.info('');

  const record = await getUpdateRecord();

  if (record) {
    output.info(`Recent update: ${record.from} -> ${record.to}`);
    output.info(`Updated at: ${record.at}`);
    output.info('');

    if (record.changelog) {
      output.info(chalk.gray('Changelog:'));
      output.info(chalk.gray(record.changelog));
      output.info('');
    }
  } else {
    output.info(chalk.gray('No update history yet'));
    output.info('');
  }

  const status = await checkForUpdate();
  if (status.hasUpdate) {
    output.success(chalk.green(`Update available: ${status.latestVersion}`));
    output.info('');
  }
}

export default updateCommand;
