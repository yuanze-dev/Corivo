/**
 * Daemon 命令 - 守护进程管理
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import os from 'os';
import fs from 'node:fs/promises';
import { getDaemonManager } from '../../daemon/index.js';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '../../storage/database.js';

export const daemonCommand = new Command('daemon');

daemonCommand
  .description('守护进程管理（仅支持 macOS）')
  .command('start')
  .description('启动并注册守护进程')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('守护进程功能仅支持 macOS'));
      console.log('');
      console.log('你可以使用以下命令手动启动心跳：');
      console.log('  corivo start');
      console.log('');
      return;
    }

    console.log('');
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log(chalk.cyan('     Corivo 守护进程                     '));
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log('');

    try {
      // 检查是否已初始化
      const configDir = getConfigDir();
      const dbPath = getDefaultDatabasePath();
      const configPath = path.join(configDir, 'config.json');

      // 读取配置文件获取数据库密钥
      let config: { db_key?: string };
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        console.log(chalk.yellow('未找到配置文件，请先运行: corivo init'));
        console.log('');
        return;
      }

      if (!config.db_key) {
        console.log(chalk.yellow('配置文件无效，请先运行: corivo init'));
        console.log('');
        return;
      }

      const dbKey = config.db_key;

      // 获取 corivo 二进制路径
      const corivoBin = process.env.CORIVO_BIN || path.join(process.cwd(), 'bin', 'corivo');
      // 或者是全局安装的路径
      const globalBin = path.join(os.homedir(), '.corivo', 'bin', 'corivo');

      const actualBin = await import('fs/promises').then(fs =>
        fs.access(corivoBin).then(() => corivoBin).catch(() => globalBin)
      );

      // 安装服务
      console.log('正在注册守护进程...');
      const result = await manager.install({
        corivoBin: actualBin,
        dbKey,
        dbPath,
      });

      if (result.success) {
        console.log(chalk.green('✔ 守护进程已启动'));
        console.log('');
        console.log('心跳将在后台持续运行。');
        console.log('');
        console.log('查看状态:  corivo daemon status');
        console.log('停止进程:  corivo daemon stop');
        console.log('');
      } else {
        console.log(chalk.red('✖ 启动失败:'), result.error);
        console.log('');
        console.log('你可以使用以下命令手动启动心跳：');
        console.log('  corivo start');
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('错误:'), error);
      process.exit(1);
    }
  });

daemonCommand
  .command('stop')
  .description('停止守护进程')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('守护进程功能仅支持 macOS'));
      console.log('');
      return;
    }

    console.log('');
    console.log('正在停止守护进程...');

    const result = await manager.uninstall();

    if (result.success) {
      console.log(chalk.green('✔ 守护进程已停止'));
      console.log('');
    } else {
      console.log(chalk.red('✖ 停止失败:'), result.error);
      console.log('');
    }
  });

daemonCommand
  .command('status')
  .description('查看守护进程状态')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('守护进程功能仅支持 macOS'));
      console.log('');
      return;
    }

    const status = await manager.getStatus();

    console.log('');
    console.log(chalk.cyan('Corivo 守护进程状态'));
    console.log('');

    if (status.loaded) {
      console.log(`状态: ${status.running ? chalk.green('运行中') : chalk.yellow('已加载但未运行')}`);
      if (status.pid) {
        console.log(`PID: ${status.pid}`);
      }
    } else {
      console.log(`状态: ${chalk.gray('未安装')}`);
    }

    console.log('');

    if (!status.loaded) {
      console.log('安装守护进程:  corivo daemon start');
      console.log('');
    } else if (!status.running) {
      console.log('启动守护进程:  launchctl start com.corivo.daemon');
      console.log('');
    }
  });

daemonCommand
  .command('run')
  .description('运行心跳循环（由 launchd 调用，不应手动执行）')
  .action(async () => {
    try {
      const { Heartbeat } = await import('../../engine/heartbeat.js');
      const heartbeat = new Heartbeat();

      console.log('[corivo] 守护进程启动中...');

      await heartbeat.start();
    } catch (error) {
      console.error('[corivo] 守护进程启动失败:', error);
      process.exit(1);
    }
  });

export default daemonCommand;
