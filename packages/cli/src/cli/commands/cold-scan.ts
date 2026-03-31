/**
 * Cold Scan command
 * Scan the user's local environment during first installation to build an initial portrait
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { coldScan } from '../../cold-scan/index.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';

export const coldScanCommand = new Command('cold-scan');

coldScanCommand
  .description('Get to know you - scan the local environment to build an initial profile')
  .option('-v, --verbose', 'Show verbose output')
  .option('--dry-run', 'Do not save to the database')
  .option('--skip <sources...>', 'Skip specified scan sources')
  .action(async (options) => {
    try {
      console.log('');
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log(chalk.cyan('     Getting to know you...              '));
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log('');
      console.log(chalk.gray('Let me take a look at your workspace...'));
      console.log('');

      const result = await coldScan({
        verbose: options.verbose || false,
        skipSources: options.skip || [],
      });

      // If not dry-run, save to database
      if (!options.dryRun) {
        // Read configuration
        const configDir = getConfigDir();
        const configPath = path.join(configDir, 'config.json');

        let config;
        try {
          const content = await fs.readFile(configPath, 'utf-8');
          config = JSON.parse(content);
        } catch {
          console.log('');
          console.log(chalk.yellow('⚠️  No config file found, skipping database save'));
          console.log(chalk.gray('Tip: run corivo init to initialize the database'));
          console.log('');
        }

        if (config?.db_key) {
          const dbKey = Buffer.from(config.db_key, 'base64');
          const dbPath = process.env.CORIVO_DB_PATH || getDefaultDatabasePath();
          const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

          // Use transactions to save blocks in batches to ensure data persistence
          let saved = 0;
          const saveTransaction = db['db'].transaction(() => {
            for (const block of result.blocks) {
              db.createBlock({
                content: String((block as any).content || ''),
                annotation: (block as any).annotation || 'pending',  // Keep original annotation
                source: (block as any).source || (block as any).metadata?.scan_source || 'cold-scan',
                vitality: 100,
              });
              saved++;
            }
          });

          saveTransaction();

          // Execute WAL checkpoint to ensure data is written to the main file
          db['db'].pragma('wal_checkpoint(TRUNCATE)');

          if (saved > 0) {
            console.log('');
            console.log(chalk.green(`💾 Saved ${saved} items to the database`));
          }
        }
      }

      console.log('');
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log(chalk.green('     Profile scan complete!              '));
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log('');
      console.log(`Places scanned: ${result.totalScanned}`);
      console.log(`Items remembered: ${result.totalFound}`);
      console.log('');

      // Show summary
      const successCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        console.log(chalk.green(`Successful sources: ${successCount}`));
      }

      if (failCount > 0) {
        console.log(chalk.yellow(`Failed sources: ${failCount}`));
      }

      // Next step tips
      if (!options.dryRun && result.totalFound > 0) {
        console.log('');
        console.log(chalk.gray('Next step: run corivo first-run to organize this information'));
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red('Scan failed:'), error);
      process.exit(1);
    }
  });

export async function coldScanAction(options: {
  verbose?: boolean;
  dryRun?: boolean;
  skip?: string[];
}) {
  return coldScan({
    verbose: options.verbose || false,
    skipSources: options.skip || [],
  });
}

export default coldScanCommand;
