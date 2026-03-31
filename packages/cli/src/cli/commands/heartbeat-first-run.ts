/**
 * First run command
 * Executed immediately after installation to speed up processing of Cold Scan results
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { Heartbeat } from '../../engine/heartbeat.js';
import { getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { printBanner } from '@/utils/banner';

export const firstRunCommand = new Command('first-run');

firstRunCommand
  .description('First run - organize remembered items')
  .option('-m, --max-pending <number>', 'Maximum pending count', '50')
  .option('-t, --time-limit <number>', 'Time limit (ms)', '8000')
  .option('--no-decay', 'Skip decay')
  .option('--no-cold-zone', 'Skip cold-zone consolidation')
  .action(async (options) => {
    try {
      printBanner('Organizing memories...', { color: chalk.cyan });

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

      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();
      const heartbeat = new Heartbeat({ dbPath });

      const result = await heartbeat.runFirstRun({
        maxPendingBlocks: parseInt(options.maxPending, 10),
        timeLimit: parseInt(options.timeLimit, 10),
        skipDecay: options.decay === false,
        skipColdZone: options.coldZone === false,
      });

      printBanner('Organization complete!', { color: chalk.green });
      console.log(`Processed ${result.processedBlocks} memories`);
      console.log(`Elapsed time: ${result.elapsedTime}ms`);
      console.log('');
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export default firstRunCommand;
