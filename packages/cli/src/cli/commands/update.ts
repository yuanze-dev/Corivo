/**
 * Update 命令 - 手动更新和检查
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
  .description('手动检查并安装更新')
  .option('--check', '仅检查更新，不安装')
  .action(async (options) => {
    await handleUpdateCommand(options);
  });

updateCommand
  .command('check')
  .description('检查是否有新版本')
  .action(async () => {
    await checkUpdates();
  });

updateCommand
  .command('status')
  .description('查看更新状态')
  .action(async () => {
    await showUpdateStatus();
  });

async function handleUpdateCommand(options: { check?: boolean }) {
  console.log('');
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log(chalk.cyan('     Corivo 更新                         '));
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log('');

  const currentVersion = getCurrentVersion();
  console.log(`当前版本: ${currentVersion}`);
  console.log('');

  // 检查更新
  console.log('正在检查更新...');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    console.log(chalk.yellow('无法连接到更新服务器'));
    console.log('');
    return;
  }

  if (!status.hasUpdate) {
    console.log(chalk.green('已是最新版本'));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.green(`发现新版本: ${status.latestVersion}`));

  if (status.isBreaking) {
    console.log(chalk.yellow('注意: 此更新包含破坏性变更'));
  }

  // 如果只是检查，不安装
  if (options.check) {
    console.log('');
    console.log('要安装更新，请运行: corivo update');
    console.log('');
    return;
  }

  // 破坏性更新需要确认
  if (status.isBreaking) {
    console.log('');
    console.log(chalk.yellow('破坏性更新需要手动确认'));
    console.log('请查看更新日志后决定是否更新');
    console.log('');
    return;
  }

  // 执行更新
  console.log('');
  console.log('正在下载更新...');

  const versionInfo = await fetchVersionInfo();
  if (!versionInfo) {
    console.log(chalk.red('获取更新信息失败'));
    console.log('');
    return;
  }

  const result = await performUpdate(versionInfo, getPlatform());

  if (result.success) {
    console.log(chalk.green('✔ 更新成功'));
    console.log('');
    console.log(`版本: ${currentVersion} → ${versionInfo.version}`);
    console.log('');
    console.log('下次 CLI 调用时将使用新版本');
    console.log('');
  } else {
    console.log(chalk.red('✖ 更新失败:'), result.error);
    console.log('');
  }
}

async function checkUpdates() {
  console.log('');
  console.log(chalk.cyan('Corivo 版本检查'));
  console.log('');

  const currentVersion = getCurrentVersion();
  console.log(`当前版本: ${currentVersion}`);
  console.log('');

  const status = await checkForUpdate();

  if (!status.latestVersion) {
    console.log(chalk.yellow('无法连接到更新服务器'));
    console.log('');
    return;
  }

  console.log(`最新版本: ${status.latestVersion}`);
  console.log('');

  if (status.hasUpdate) {
    console.log(chalk.green('有可用更新'));

    const record = await getUpdateRecord();
    if (record && record.to !== status.latestVersion) {
      console.log(`最近更新: ${record.from} → ${record.to}`);
    }
  } else {
    console.log(chalk.gray('已是最新版本'));
  }

  console.log('');
}

async function showUpdateStatus() {
  console.log('');
  console.log(chalk.cyan('Corivo 更新状态'));
  console.log('');

  const record = await getUpdateRecord();

  if (record) {
    console.log(`最近更新: ${record.from} → ${record.to}`);
    console.log(`更新时间: ${record.at}`);
    console.log('');

    if (record.changelog) {
      console.log(chalk.gray('更新日志:'));
      console.log(chalk.gray(record.changelog));
      console.log('');
    }
  } else {
    console.log(chalk.gray('暂无更新记录'));
    console.log('');
  }

  const status = await checkForUpdate();
  if (status.hasUpdate) {
    console.log(chalk.green(`有可用更新: ${status.latestVersion}`));
    console.log('');
  }
}

export default updateCommand;
