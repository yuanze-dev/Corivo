/**
 * Daemon 命令 - 守护进程管理
 */

import fs from 'node:fs/promises';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import os from 'os';
import { getDaemonManager } from '../../daemon/index.js';
import { getConfigDir, getDefaultDatabasePath } from '../../storage/database.js';
import { loadConfig, isInitialized } from '../../config.js';

export const daemonCommand = new Command('daemon');

daemonCommand
  .description('后台心跳管理（仅支持 macOS）')
  .command('start')
  .description('启动并注册守护进程')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('后台心跳功能仅支持 macOS'));
      console.log('');
      console.log('你可以使用以下命令手动启动心跳：');
      console.log('  corivo start');
      console.log('');
      return;
    }

    console.log('');
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log(chalk.cyan('     Corivo 后台心跳                     '));
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log('');

    try {
      // 检查是否已初始化
      const configDir = getConfigDir();
      const dbPath = getDefaultDatabasePath();

      // 读取配置文件
      const config = await loadConfig(configDir);
      if (!config) {
        console.log(chalk.yellow('未找到配置文件，请先运行: corivo init'));
        console.log('');
        return;
      }

      const dbKey = config.db_key;

      // 获取 corivo 二进制路径
      // 开发环境：使用 node + dist/cli/index.js
      // 生产环境：使用独立的 corivo 二进制
      const possiblePaths = [
        process.env.CORIVO_BIN,
        path.join(process.cwd(), 'bin', 'corivo'),
        path.join(os.homedir(), '.corivo', 'bin', 'corivo'),
      ];

      let actualBin = '';

      for (const p of possiblePaths) {
        if (p && await fs.access(p).then(() => true).catch(() => false)) {
          actualBin = p;
          break;
        }
      }

      // 如果没有找到二进制文件，使用开发模式（node + dist）
      if (!actualBin) {
        const nodePath = process.execPath; // 当前 node 路径
        const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
        actualBin = `${nodePath} ${cliPath}`;
      }

      // 安装服务
      console.log('正在启动后台心跳...');
      const result = await manager.install({
        corivoBin: actualBin,
        dbKey,
        dbPath,
      });

      if (result.success) {
        console.log(chalk.green('✔ 后台心跳已启动'));
        console.log('');
        console.log('我会一直在后台默默工作。');
        console.log('');
        console.log('查看状态:  corivo daemon status');
        console.log('停止心跳:  corivo daemon stop');
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
  .description('停止后台心跳')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('后台心跳功能仅支持 macOS'));
      console.log('');
      return;
    }

    console.log('');
    console.log('正在停止后台心跳...');

    const result = await manager.uninstall();

    if (result.success) {
      console.log(chalk.green('✔ 后台心跳已停止'));
      console.log('');
      console.log('期待下次与你一起工作！');
      console.log('');
    } else {
      console.log(chalk.red('✖ 停止失败:'), result.error);
      console.log('');
    }
  });

daemonCommand
  .command('status')
  .description('查看后台心跳状态')
  .action(async () => {
    const manager = await getDaemonManager();

    if (!manager) {
      console.log('');
      console.log(chalk.yellow('后台心跳功能仅支持 macOS'));
      console.log('');
      return;
    }

    const status = await manager.getStatus();

    console.log('');
    console.log(chalk.cyan('Corivo 后台心跳状态'));
    console.log('');

    if (status.loaded) {
      console.log(`状态: ${status.running ? chalk.green('正在工作') : chalk.yellow('已就绪但未运行')}`);
      if (status.pid) {
        console.log(`PID: ${status.pid}`);
      }
    } else {
      console.log(`状态: ${chalk.gray('未启动')}`);
    }

    console.log('');

    if (!status.loaded) {
      console.log('启动后台心跳:  corivo daemon start');
      console.log('');
    } else if (!status.running) {
      console.log('启动心跳:  launchctl start com.corivo.daemon');
      console.log('');
    }
  });

daemonCommand
  .command('run')
  .description('运行心跳循环（由系统调用，不应手动执行）')
  .action(async () => {
    try {
      const { Heartbeat } = await import('../../engine/heartbeat.js');
      const heartbeat = new Heartbeat();

      console.log('[corivo] 后台心跳启动中...');
      console.log('[corivo] 我会一直在后台默默工作。');

      await heartbeat.start();
    } catch (error) {
      console.error('[corivo] 后台心跳启动失败:', error);
      process.exit(1);
    }
  });

export default daemonCommand;
