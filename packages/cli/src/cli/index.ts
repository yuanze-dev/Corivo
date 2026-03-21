/**
 * CLI 主入口
 *
 * Corivo 命令行界面
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 读取版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 在开发环境中从项目根目录读取，在生产环境中从 dist 目录读取
const packagePath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
const VERSION = packageJson.version;

// 导入命令
import { initCommand } from './commands/init.js';
import { saveCommand } from './commands/save.js';
import { queryCommand } from './commands/query.js';
import { statusCommand } from './commands/status.js';
import { startCommand, startWatchCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { doctorCommand } from './commands/doctor.js';
import { recoverCommand } from './commands/recover.js';
import { injectCommand } from './commands/inject.js';
import { identityCommand } from './commands/identity.js';
import { setupPasswordCommand } from './commands/setup-password.js';
import { unlockCommand } from './commands/unlock.js';
import { verifyIdentityCommand } from './commands/verify-identity.js';
import { coldScanCommand } from './commands/cold-scan.js';
import { pushCommand } from './commands/push.js';
import { pushQueueCommand } from './commands/push-queue.js';
import { remindersCommand } from './commands/reminders.js';
import { suggestCommand } from './commands/suggest.js';
import { firstRunCommand } from './commands/heartbeat-first-run.js';
import { daemonCommand } from './commands/daemon.js';
import { updateCommand } from './commands/update.js';
import { createSyncCommand } from './commands/sync.js';

const program = new Command();

program
  .name('corivo')
  .description('你的硅基同事 — 它只为你活着')
  .version(VERSION);

// 注册命令
program
  .command('init')
  .description('初始化 Corivo')
  .action(initCommand);

program
  .command('save')
  .description('保存信息')
  .option('-c, --content <text>', '内容')
  .option('-a, --annotation <text>', '标注（性质 · 领域 · 标签）')
  .option('-s, --source <text>', '来源')
  .option('--pending', '以 pending 模式保存（稍后由心跳进程自动标注）')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action((options) => saveCommand(options));

program
  .command('query')
  .description('查询信息')
  .argument('<query>', '搜索关键词')
  .option('-l, --limit <number>', '返回数量', '10')
  .option('-v, --verbose', '显示详细信息')
  .option('-p, --pattern', '显示决策模式')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action((query, options) => queryCommand(query, options));

program
  .command('status')
  .description('查看状态')
  .option('--no-password', '跳过密码输入（开发模式）')
  .option('--tui', '启动交互式状态面板')
  .action(async (options) => {
    if (options.tui) {
      const { renderTui } = await import('../tui/index.js');
      await renderTui();
    } else {
      await statusCommand(options);
    }
  });

program
  .command('start')
  .description('启动守护进程')
  .option('-w, --watch', '监控模式：自动重启崩溃的进程')
  .action(async (options) => {
    if (options.watch) {
      await startWatchCommand();
    } else {
      await startCommand();
    }
  });

program
  .command('stop')
  .description('停止守护进程')
  .action(stopCommand);

program
  .command('doctor')
  .description('健康检查')
  .action(doctorCommand);

program
  .command('recover')
  .description('密钥恢复')
  .action(recoverCommand);

program
  .command('inject')
  .description('注入 Corivo 规则到项目')
  .option('-t, --target <path>', '目标项目路径')
  .option('-g, --global', '注入到全局 CLAUDE.md')
  .option('--eject', '移除已注入的规则')
  .option('--force', '强制替换已存在的规则')
  .action((options) => injectCommand(options));

program
  .command('identity')
  .description('查看身份信息')
  .option('-v, --verbose', '显示详细信息')
  .action((options) => identityCommand(options));

program
  .command('setup-password')
  .description('设置主密码（用于数据库加密和跨设备验证）')
  .option('-f, --force', '强制修改已有密码')
  .action((options) => setupPasswordCommand(options));

program
  .command('unlock')
  .description('解锁并查看数据库内容')
  .option('-r, --raw', '原始格式输出')
  .option('-l, --limit <number>', '返回数量', '100')
  .action((options) => unlockCommand(options));

program
  .command('verify-identity')
  .description('跨设备身份验证（指纹 + 密码）')
  .option('-p, --password <password>', '主密码')
  .option('-v, --verbose', '显示详细信息')
  .action((options) => verifyIdentityCommand(options));

program.addCommand(coldScanCommand);
program.addCommand(pushCommand);
program.addCommand(pushQueueCommand);
program.addCommand(remindersCommand);
program.addCommand(suggestCommand);
program.addCommand(firstRunCommand);
program.addCommand(daemonCommand);
program.addCommand(updateCommand);
program.addCommand(createSyncCommand());

// 错误处理
program.configureOutput({
  writeErr: (str) => {
    if (str.includes('error:')) {
      console.error(chalk.red(str));
    } else {
      console.error(str);
    }
  },
});

// 解析参数
program.parseAsync().catch((error) => {
  if (error instanceof Error) {
    console.error(chalk.red(`错误: ${error.message}`));
    process.exit(1);
  }
});
