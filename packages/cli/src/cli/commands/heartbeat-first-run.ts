/**
 * First run command
 * Executed immediately after installation to speed up processing of Cold Scan results
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { runHeartbeatFirstRun } from '@/application/review/heartbeat-first-run.js';
import { getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { printBanner } from '@/utils/banner';
import { getCliOutput } from '@/cli/runtime';

export const firstRunCommand = new Command('first-run');

firstRunCommand
  .description('First run - organize remembered items')
  .option('-m, --max-pending <number>', 'Maximum pending count', '50')
  .option('-t, --time-limit <number>', 'Time limit (ms)', '8000')
  .option('--no-decay', 'Skip decay')
  .option('--no-cold-zone', 'Skip cold-zone consolidation')
  .action(async (options) => {
    const output = getCliOutput();
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
        output.info('');
        output.warn(chalk.yellow('Please run corivo init first'));
        output.info('');
        return;
      }

      const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();
      const result = await runHeartbeatFirstRun(dbPath, {
        maxPendingBlocks: parseInt(options.maxPending, 10),
        timeLimit: parseInt(options.timeLimit, 10),
        skipDecay: options.decay === false,
        skipColdZone: options.coldZone === false,
      });

      printBanner('Organization complete!', { color: chalk.green });
      output.info(`Processed ${result.processedBlocks} memories`);
      output.info(`Elapsed time: ${result.elapsedTime}ms`);
      output.info('');
    } catch (error) {
      output.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

export default firstRunCommand;
