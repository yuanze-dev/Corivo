/**
 * 首次运行命令
 * 安装后立即执行，加速处理 Cold Scan 结果
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { Heartbeat } from '../../engine/heartbeat.js';
import { getConfigDir, getDefaultDatabasePath } from '../../storage/database.js';

export const firstRunCommand = new Command('first-run');

firstRunCommand
  .description('首次运行 - 整理记住的事')
  .option('-m, --max-pending <number>', '最大 pending 数量', '50')
  .option('-t, --time-limit <number>', '时间限制（毫秒）', '8000')
  .option('--no-decay', '跳过衰减')
  .option('--no-cold-zone', '跳过冷区整合')
  .action(async (options) => {
    try {
      console.log('');
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log(chalk.cyan('     正在整理记忆...                    '));
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log('');

      // 读取配置
      const configDir = getConfigDir();
      const configPath = path.join(configDir, 'config.json');

      let config;
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        console.log('');
        console.log(chalk.yellow('请先运行 corivo init'));
        console.log('');
        return;
      }

      // 获取数据库密钥
      let dbKey = process.env.CORIVO_DB_KEY;
      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();

      if (!dbKey && config.db_key) {
        dbKey = config.db_key;
      }

      if (!dbKey) {
        console.log('');
        console.log(chalk.yellow('数据库未初始化，请先运行: corivo init'));
        console.log('');
        return;
      }

      const heartbeat = new Heartbeat({ dbKey, dbPath });

      const result = await heartbeat.runFirstRun({
        maxPendingBlocks: parseInt(options.maxPending, 10),
        timeLimit: parseInt(options.timeLimit, 10),
        skipDecay: options.decay === false,
        skipColdZone: options.coldZone === false,
      });

      console.log('');
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log(chalk.green('     整理完成！                          '));
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log('');
      console.log(`处理了 ${result.processedBlocks} 条记忆`);
      console.log(`用时: ${result.elapsedTime}ms`);
      console.log('');
    } catch (error) {
      console.error(chalk.red('错误:'), error);
      process.exit(1);
    }
  });

export default firstRunCommand;
