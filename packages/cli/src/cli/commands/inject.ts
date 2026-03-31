/**
 * CLI command - inject
 *
 * Injects Corivo rules into project configuration files.
 */

import path from 'node:path';
import chalk from 'chalk';
import { injectRules, ejectRules as ejectClaudeRules, injectGlobalRules, injectProjectRules, hasCorivoRules } from '../../inject/claude-rules.js';
import { injectGlobalClaudeCodeHost } from '../../inject/claude-host.js';
import { injectGlobalCodexRules } from '../../inject/codex-rules.js';
import { injectGlobalCursorRules } from '../../inject/cursor-rules.js';
import { injectGlobalOpencodePlugin } from '../../inject/opencode-plugin.js';

export async function injectCommand(options: {
  target?: string;
  eject?: boolean;
  global?: boolean;
  force?: boolean;
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  opencode?: boolean;
}): Promise<void> {
  if (options.eject) {
    // Remove rule
    await ejectRules(options.target);
    return;
  }

  if (options.global) {
    if (options.claudeCode) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     安装全局 Claude Code 适配器         '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalClaudeCodeHost();

      if (result.success) {
        console.log(chalk.green('✔ Claude Code 已配置到:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Claude Code 现在会自动使用 Corivo 主动记忆流程'));
        console.log('');
      } else {
        console.log(chalk.red('✖ 安装失败:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.codex) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     注入全局 Codex 规则                 '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalCodexRules();

      if (result.success) {
        console.log(chalk.green('✔ 规则已注入到:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Codex 现在会自动使用 Corivo 主动记忆流程'));
        console.log('');
      } else {
        console.log(chalk.red('✖ 注入失败:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.cursor) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     注入全局 Cursor 规则                '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalCursorRules();

      if (result.success) {
        console.log(chalk.green('✔ 规则已注入到:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Cursor 现在会自动使用 Corivo 主动记忆规则'));
        console.log('');
      } else {
        console.log(chalk.red('✖ 注入失败:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.opencode) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     安装全局 OpenCode 插件              '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalOpencodePlugin();

      if (result.success) {
        console.log(chalk.green('✔ 插件已安装到:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('OpenCode 现在会自动加载 Corivo 主动记忆插件'));
        console.log('');
      } else {
        console.log(chalk.red('✖ 安装失败:'), result.error);
        console.log('');
      }

      return;
    }

    // Inject into global CLAUDE.md
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
    } else {
      console.log(chalk.red('✖ 注入失败:'), result.error);
      console.log('');
    }

    return;
  }

  // Inject into project CLAUDE.md
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
  } else {
    console.log(chalk.red('✖ 注入失败:'), result.error);
    console.log('');
  }
}

/**
 * Remove injected rules
 */
async function ejectRules(targetPath?: string): Promise<void> {
  const claudeMd = path.join(targetPath || process.cwd(), 'CLAUDE.md');

  console.log('');
  console.log('正在移除 Corivo 规则...');

  const result = await ejectClaudeRules(claudeMd);

  if (result.success) {
    console.log(chalk.green('✔ Corivo 规则已移除'));
    console.log('');
  } else {
    console.log(chalk.red('✖ 移除失败:'), result.error);
    console.log('');
  }
}

// Export for CLI use
export default { injectCommand, ejectRules };
