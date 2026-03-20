/**
 * Cold Scan 命令
 * 首次安装时扫描用户本地环境，构建初始画像
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { coldScan } from '../../cold-scan/index.js';

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

      console.log('');
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log(chalk.green('     认识你完成！                        '));
      console.log(chalk.green('══════════════════════════════════════════'));
      console.log('');
      console.log(`看过的地方: ${result.totalScanned}`);
      console.log(`记住的事: ${result.totalFound} 条`);
      console.log('');

      // 显示摘要
      const successCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        console.log(chalk.green(`成功: ${successCount} 个来源`));
      }

      if (failCount > 0) {
        console.log(chalk.yellow(`失败: ${failCount} 个来源`));
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
