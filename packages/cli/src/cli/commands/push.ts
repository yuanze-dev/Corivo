/**
 * Push command
 * Output push message
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { generateFirstPush, getWelcomeMessage } from '../../first-push/index.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';

export const pushCommand = new Command('push');

pushCommand
  .description('Output push messages')
  .option('-f, --first-activation', 'Intro message for first activation')
  .option('-w, --welcome', 'Welcome message')
  .action(async (options) => {
    try {
      if (options.welcome) {
        // Output welcome message
        console.log('');
        console.log(chalk.cyan(getWelcomeMessage()));
        console.log('');
        return;
      }

      // Read configuration
      const configDir = getConfigDir();
      const configPath = path.join(configDir, 'config.json');

      let config;
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        console.log('');
        console.log(chalk.yellow('Please run corivo init first'));
        console.log('');
        return;
      }

      // Get database key
      let dbKeyBase64 = process.env.CORIVO_DB_KEY;
      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();

      if (!dbKeyBase64 && config.db_key) {
        dbKeyBase64 = config.db_key;
      }

      if (!dbKeyBase64) {
        console.log('');
        console.log(chalk.yellow('Database is not initialized, please run: corivo init'));
        console.log('');
        return;
      }

      const dbKey = Buffer.from(dbKeyBase64, 'base64');
      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

      if (options.firstActivation) {
        // Output self-introduction for first activation
        // Get recently scanned blocks
        const blocks = db.queryBlocks({ limit: 100 });

        // Filter out blocks from Cold Scan (source is cold-scan or a known scan source)
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

      // Default: Display messages to be pushed
      const blocks = db.queryBlocks({ limit: 10 });

      if (blocks.length === 0) {
        console.log('');
        console.log(chalk.gray('No pending push messages'));
        console.log('');
        return;
      }

      console.log('');
      console.log(chalk.cyan('Pending push messages:'));
      console.log('');

      for (const block of blocks) {
        console.log(chalk.gray(`[${block.annotation}]`));
        console.log(block.content);
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export default pushCommand;
