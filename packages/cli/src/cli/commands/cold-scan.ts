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
  .description('认识你 - 扫描本地环境构建初始画像')
  .option('-v, --verbose', '显示详细输出')
  .option('--dry-run', '不保存到数据库')
  .option('--skip <sources...>', '跳过指定的扫描源')
  .action(async (options) => {
    try {
      console.log('');
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log(chalk.cyan('     正在认识你...                      '));
      console.log(
        chalk.cyan('══════════════════════════════════════════')
      );
      console.log('');
      console.log(chalk.gray('让我看看你的工作环境...'));
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
          console.log(chalk.yellow('⚠️  未找到配置文件，跳过保存到数据库'));
          console.log(chalk.gray('提示: 运行 corivo init 初始化数据库'));
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
            console.log(chalk.green(`💾 已保存 ${saved} 条信息到数据库`));
          }
        }
      }

      console.log('');
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log(chalk.green('     认识你完成！                        '));
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log('');
      console.log(`看过的地方: ${result.totalScanned}`);
      console.log(`记住的事: ${result.totalFound} 条`);
      console.log('');

      // Show summary
      const successCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        console.log(chalk.green(`成功: ${successCount} 个来源`));
      }

      if (failCount > 0) {
        console.log(chalk.yellow(`失败: ${failCount} 个来源`));
      }

      // Next step tips
      if (!options.dryRun && result.totalFound > 0) {
        console.log('');
        console.log(chalk.gray('下一步: 运行 corivo first-run 整理这些信息'));
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red('扫描失败:'), error);
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
