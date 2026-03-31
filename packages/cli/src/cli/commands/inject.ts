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
      console.log(chalk.cyan('     Installing global Claude Code adapter'));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalClaudeCodeHost();

      if (result.success) {
        console.log(chalk.green('✔ Claude Code configured at:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Claude Code will now automatically use the Corivo proactive-memory flow'));
        console.log('');
      } else {
        console.log(chalk.red('✖ Installation failed:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.codex) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     Injecting global Codex rules         '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalCodexRules();

      if (result.success) {
        console.log(chalk.green('✔ Rules injected into:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Codex will now automatically use the Corivo proactive-memory flow'));
        console.log('');
      } else {
        console.log(chalk.red('✖ Injection failed:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.cursor) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     Injecting global Cursor rules        '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalCursorRules();

      if (result.success) {
        console.log(chalk.green('✔ Rules injected into:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('Cursor will now automatically use Corivo proactive-memory rules'));
        console.log('');
      } else {
        console.log(chalk.red('✖ Injection failed:'), result.error);
        console.log('');
      }

      return;
    }

    if (options.opencode) {
      console.log('');
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log(chalk.cyan('     Installing global OpenCode plugin    '));
      console.log(chalk.cyan('══════════════════════════════════════════'));
      console.log('');

      const result = await injectGlobalOpencodePlugin();

      if (result.success) {
        console.log(chalk.green('✔ Plugin installed at:'));
        console.log(`  ${result.path}`);
        console.log('');
        console.log(chalk.gray('OpenCode will now automatically load the Corivo proactive-memory plugin'));
        console.log('');
      } else {
        console.log(chalk.red('✖ Installation failed:'), result.error);
        console.log('');
      }

      return;
    }

    // Inject into global CLAUDE.md
    console.log('');
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log(chalk.cyan('     Injecting global rules              '));
    console.log(chalk.cyan('══════════════════════════════════════════'));
    console.log('');

    const result = await injectGlobalRules();

    if (result.success) {
      console.log(chalk.green('✔ Rules injected into:'));
      console.log(`  ${result.path}`);
      console.log('');
      console.log(chalk.gray('Claude Code will now automatically use Corivo memory features'));
      console.log('');
    } else {
      console.log(chalk.red('✖ Injection failed:'), result.error);
      console.log('');
    }

    return;
  }

  // Inject into project CLAUDE.md
  const targetPath = options.target || process.cwd();
  const claudeMd = path.join(targetPath, 'CLAUDE.md');

  console.log('');
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log(chalk.cyan('     Injecting project rules             '));
  console.log(chalk.cyan('══════════════════════════════════════════'));
  console.log('');

  const hasExisting = await hasCorivoRules(claudeMd);
  if (hasExisting && !options.force) {
    console.log(chalk.yellow('Project already contains Corivo rules, skipping injection'));
    console.log('');
    console.log('To update the rules, run: corivo inject --force');
    console.log('To remove the rules, run: corivo inject --eject');
    console.log('');
    return;
  }

  const result = await injectRules(claudeMd, { force: options.force });

  if (result.success) {
    console.log(chalk.green('✔ Rules injected into:'));
    console.log(`  ${claudeMd}`);
    console.log('');
    console.log(chalk.gray('Claude Code will now automatically use Corivo memory features'));
    console.log('');
  } else {
    console.log(chalk.red('✖ Injection failed:'), result.error);
    console.log('');
  }
}

/**
 * Remove injected rules
 */
async function ejectRules(targetPath?: string): Promise<void> {
  const claudeMd = path.join(targetPath || process.cwd(), 'CLAUDE.md');

  console.log('');
  console.log('Removing Corivo rules...');

  const result = await ejectClaudeRules(claudeMd);

  if (result.success) {
    console.log(chalk.green('✔ Corivo rules removed'));
    console.log('');
  } else {
    console.log(chalk.red('✖ Removal failed:'), result.error);
    console.log('');
  }
}

// Export for CLI use
export default { injectCommand, ejectRules };
