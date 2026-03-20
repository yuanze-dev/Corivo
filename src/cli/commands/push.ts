/**
 * Push 命令
 * 输出推送消息
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { generateFirstPush, getWelcomeMessage } from '../../first-push/index.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';

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
      let dbKeyBase64 = process.env.CORIVO_DB_KEY;
      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();

      if (!dbKeyBase64 && config.db_key) {
        dbKeyBase64 = config.db_key;
      }

      if (!dbKeyBase64) {
        console.log('');
        console.log(chalk.yellow('数据库未初始化，请先运行: corivo init'));
        console.log('');
        return;
      }

      const dbKey = Buffer.from(dbKeyBase64, 'base64');
      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

      if (options.firstActivation) {
        // 输出首次激活的自我介绍
        // 获取最近扫描的 blocks
        const blocks = db.queryBlocks({ limit: 100 });

        // 过滤出来自 Cold Scan 的 blocks（source 为 cold-scan 或已知的扫描源）
        const scanSources = new Set(['cold-scan', 'package-json', 'claude-code', 'prettier-config', 'editorconfig', 'tsconfig', 'git-config', 'npm-config', 'yarn-config', 'pnpm-config']);
        const scannedBlocks = blocks.filter(
          (b: any) => scanSources.has(b.source)
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
