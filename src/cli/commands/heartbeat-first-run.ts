/**
 * 首次运行命令
 * 安装后立即执行，加速处理 Cold Scan 结果
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Heartbeat } from '../../engine/heartbeat.js';

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

      const heartbeat = new Heartbeat();

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
