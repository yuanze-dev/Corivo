/**
 * CLI 主入口
 *
 * Corivo 命令行界面
 */
import { Command } from 'commander';
import chalk from 'chalk';
// 导入命令
import { initCommand } from './commands/init.js';
import { saveCommand } from './commands/save.js';
import { queryCommand } from './commands/query.js';
import { statusCommand } from './commands/status.js';
import { startCommand, startWatchCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { doctorCommand } from './commands/doctor.js';
import { recoverCommand } from './commands/recover.js';
const program = new Command();
program
    .name('corivo')
    .description('你的赛博伙伴 — 记忆存储与智能推送')
    .version('0.10.0-mvp');
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
    .action(saveCommand);
program
    .command('query')
    .description('查询信息')
    .argument('<query>', '搜索关键词')
    .option('-l, --limit <number>', '返回数量', '10')
    .option('-v, --verbose', '显示详细信息')
    .option('-p, --pattern', '显示决策模式')
    .action(queryCommand);
program
    .command('status')
    .description('查看状态')
    .action(statusCommand);
program
    .command('start')
    .description('启动守护进程')
    .option('-w, --watch', '监控模式：自动重启崩溃的进程')
    .action(async (options) => {
    if (options.watch) {
        await startWatchCommand();
    }
    else {
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
// 错误处理
program.configureOutput({
    writeErr: (str) => {
        if (str.includes('error:')) {
            console.error(chalk.red(str));
        }
        else {
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
//# sourceMappingURL=index.js.map