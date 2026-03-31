/**
 * Update command - manual update check and installation.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  checkForUpdate,
  performUpdate,
  getPlatform,
  getUpdateRecord,
  getCurrentVersion,
  fetchVersionInfo,
} from '../../update/checker.js';
import type { UpdateConfig } from '../../update/types.js';

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
  console.log('');
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log(chalk.cyan('     Corivo Update                       '));
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log('');

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);
  console.log('');

  // Check for updates
  console.log('Checking for updates...');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    console.log(chalk.yellow('Unable to connect to the update server'));
    console.log('');
    return;
  }

  if (!status.hasUpdate) {
    console.log(chalk.green('Already on the latest version'));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.green(`New version available: ${status.latestVersion}`));

  if (status.isBreaking) {
    console.log(chalk.yellow('Note: this update contains breaking changes'));
  }

  // If you just check, don’t install
  if (options.check) {
    console.log('');
    console.log('To install the update, run: corivo update');
    console.log('');
    return;
  }

  // Breaking updates require confirmation
  if (status.isBreaking) {
    console.log('');
    console.log(chalk.yellow('Breaking updates require manual confirmation'));
    console.log('Please review the changelog before updating');
    console.log('');
    return;
  }

  // perform update
  console.log('');
  console.log('Downloading update...');

  const versionInfo = await fetchVersionInfo();
  if (!versionInfo) {
    console.log(chalk.red('Failed to fetch update information'));
    console.log('');
    return;
  }

  const result = await performUpdate(versionInfo, getPlatform());

  if (result.success) {
    console.log(chalk.green('✔ Update successful'));
    console.log('');
    console.log(`Version: ${currentVersion} -> ${versionInfo.version}`);
    console.log('');
    console.log('The new version will be used on the next CLI invocation');
    console.log('');
  } else {
    console.log(chalk.red('✖ Update failed:'), result.error);
    console.log('');
  }
}

async function checkUpdates() {
  console.log('');
  console.log(chalk.cyan('Corivo Version Check'));
  console.log('');

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);
  console.log('');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    console.log(chalk.yellow('Unable to connect to the update server'));
    console.log('');
    return;
  }

  console.log(`Latest version: ${status.latestVersion}`);
  console.log('');

  if (status.hasUpdate) {
    console.log(chalk.green('An update is available'));

    const record = await getUpdateRecord();
    if (record && record.to !== status.latestVersion) {
      console.log(`Recent update: ${record.from} -> ${record.to}`);
    }
  } else {
    console.log(chalk.gray('Already on the latest version'));
  }

  console.log('');
}

async function showUpdateStatus() {
  console.log('');
  console.log(chalk.cyan('Corivo Update Status'));
  console.log('');

  const record = await getUpdateRecord();

  if (record) {
    console.log(`Recent update: ${record.from} -> ${record.to}`);
    console.log(`Updated at: ${record.at}`);
    console.log('');

    if (record.changelog) {
      console.log(chalk.gray('Changelog:'));
      console.log(chalk.gray(record.changelog));
      console.log('');
    }
  } else {
    console.log(chalk.gray('No update history yet'));
    console.log('');
  }

  const status = await checkForUpdate();
  if (status.hasUpdate) {
    console.log(chalk.green(`Update available: ${status.latestVersion}`));
    console.log('');
  }
}

export default updateCommand;
