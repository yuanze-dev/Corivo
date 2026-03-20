/**
 * CLI 命令 - inject
 *
 * 注入 Corivo 规则到项目配置文件
 */
import path from 'node:path';
import chalk from 'chalk';
import { injectRules, ejectRules as ejectClaudeRules, injectGlobalRules, hasCorivoRules } from '../../inject/claude-rules.js';
export async function injectCommand(options) {
    if (options.eject) {
        // 移除规则
        await ejectRules(options.target);
        return;
    }
    if (options.global) {
        // 注入到全局 CLAUDE.md
        console.log('');
        console.log(chalk.cyan('══════════════════════════════════════════'));
        console.log(chalk.cyan('     注入全局规则                       '));
        console.log(chalk.cyan('══════════════════════════════════════════'));
        console.log('');
        const result = await injectGlobalRules();
        if (result.success) {
            console.log(chalk.green('✔ 规则已注入到:'));
            console.log(`  ${result.path}`);
            console.log('');
            console.log(chalk.gray('Claude Code 现在会自动使用 Corivo 记忆功能'));
            console.log('');
        }
        else {
            console.log(chalk.red('✖ 注入失败:'), result.error);
            console.log('');
        }
        return;
    }
    // 注入到项目 CLAUDE.md
    const targetPath = options.target || process.cwd();
    const claudeMd = path.join(targetPath, 'CLAUDE.md');
    console.log('');
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log(chalk.cyan('     注入项目规则                       '));
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log('');
    const hasExisting = await hasCorivoRules(claudeMd);
    if (hasExisting && !options.force) {
        console.log(chalk.yellow('项目已包含 Corivo 规则，跳过注入'));
        console.log('');
        console.log('如需更新规则，请使用: corivo inject --force');
        console.log('如需移除规则，请使用: corivo inject --eject');
        console.log('');
        return;
    }
    const result = await injectRules(claudeMd, { force: options.force });
    if (result.success) {
        console.log(chalk.green('✔ 规则已注入到:'));
        console.log(`  ${claudeMd}`);
        console.log('');
        console.log(chalk.gray('Claude Code 现在会自动使用 Corivo 记忆功能'));
        console.log('');
    }
    else {
        console.log(chalk.red('✖ 注入失败:'), result.error);
        console.log('');
    }
}
/**
 * 移除注入的规则
 */
async function ejectRules(targetPath) {
    const claudeMd = path.join(targetPath || process.cwd(), 'CLAUDE.md');
    console.log('');
    console.log('正在移除 Corivo 规则...');
    const result = await ejectClaudeRules(claudeMd);
    if (result.success) {
        console.log(chalk.green('✔ Corivo 规则已移除'));
        console.log('');
    }
    else {
        console.log(chalk.red('✖ 移除失败:'), result.error);
        console.log('');
    }
}
// 导出供 CLI 使用
export default { injectCommand, ejectRules };
//# sourceMappingURL=inject.js.map