/**
 * Push 命令
 * 输出推送消息
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { generateFirstPush, getWelcomeMessage } from '../../first-push/index.js';
import { CorivoDatabase } from '../../storage/database.js';

export const pushCommand = new Command('push');

pushCommand
  .description('输出推送消息')
  .option('-f, --first-activation', '首次激活时的自我介绍')
  .option('-w, --welcome', '欢迎消息')
  .action(async (options) => {
    try {
      if (options.welcome) {
        // 输出欢迎消息
        console.log('');
        console.log(chalk.cyan(getWelcomeMessage()));
        console.log('');
        return;
      }

      if (options.firstActivation) {
        // 输出首次激活的自我介绍
        // 使用环境变量获取数据库配置
        const dbKeyBase64 = process.env.CORIVO_DB_KEY;
        const dbPath = process.env.CORIVO_DB_PATH;

        if (!dbKeyBase64 || !dbPath) {
          console.log('');
          console.log(chalk.yellow('请先运行 corivo init 初始化数据库'));
          console.log('');
          return;
        }

        const dbKey = Buffer.from(dbKeyBase64, 'base64');
        const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

        // 获取最近扫描的 blocks
        const blocks = db.queryBlocks({ limit: 100 });

        // 过滤出带有 scan_source 的 blocks（来自 Cold Scan）
        const scannedBlocks = blocks.filter(
          (b: any) => b.metadata?.scan_source
        );

        const { message } = generateFirstPush(
          scannedBlocks.map((b: any) => ({
            content: b.content,
            annotation: b.annotation,
            metadata: b.metadata,
          }))
        );

        console.log('');
        console.log(chalk.cyan(message));
        console.log('');
        return;
      }

      // 默认：显示待推送的消息
      const dbKeyBase64 = process.env.CORIVO_DB_KEY;
      const dbPath = process.env.CORIVO_DB_PATH;

      if (!dbKeyBase64 || !dbPath) {
        console.log('');
        console.log(chalk.yellow('请先运行 corivo init 初始化数据库'));
        console.log('');
        return;
      }

      const dbKey = Buffer.from(dbKeyBase64, 'base64');
      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
      const blocks = db.queryBlocks({ limit: 10 });

      if (blocks.length === 0) {
        console.log('');
        console.log(chalk.gray('没有待推送的消息'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.cyan('待推送的消息：'));
      console.log('');

      for (const block of blocks) {
        console.log(chalk.gray(`[${block.annotation}]`));
        console.log(block.content);
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('错误:'), error);
      process.exit(1);
    }
  });

export default pushCommand;
