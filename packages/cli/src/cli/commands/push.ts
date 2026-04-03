/**
 * Push command
 * Output push message
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { generateFirstPush, getWelcomeMessage } from '../../first-push/index.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { getCliOutput } from '@/cli/runtime';

export const pushCommand = new Command('push');

pushCommand
  .description('Output push messages')
  .option('-f, --first-activation', 'Intro message for first activation')
  .option('-w, --welcome', 'Welcome message')
  .action(async (options) => {
    const output = getCliOutput();
    try {
      if (options.welcome) {
        // Output welcome message
        output.info('');
        output.info(chalk.cyan(getWelcomeMessage()));
        output.info('');
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
        output.info('');
        output.warn(chalk.yellow('Please run corivo init first'));
        output.info('');
        return;
      }

      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();

      if (config.encrypted_db_key) {
        output.info('');
        output.warn(chalk.yellow('Detected a legacy password-based config. Please run: corivo init'));
        output.info('');
        return;
      }

      const db = CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false });

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

        output.info('');
        output.info(chalk.cyan(message));
        output.info('');
        return;
      }

      // Default: Display messages to be pushed
      const blocks = db.queryBlocks({ limit: 10 });

      if (blocks.length === 0) {
        output.info('');
        output.info(chalk.gray('No pending push messages'));
        output.info('');
        return;
      }

      output.info('');
      output.info(chalk.cyan('Pending push messages:'));
      output.info('');

      for (const block of blocks) {
        output.info(chalk.gray(`[${block.annotation}]`));
        output.info(block.content);
        output.info('');
      }
    } catch (error) {
      output.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export default pushCommand;
