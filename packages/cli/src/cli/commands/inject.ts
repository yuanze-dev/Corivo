/**
 * CLI command - inject
 *
 * Injects Corivo rules into project configuration files.
 */

import path from 'node:path';
import chalk from 'chalk';
import { printBanner } from '@/utils/banner';
import { injectRules, ejectRules as ejectClaudeRules, injectGlobalRules, injectProjectRules, hasCorivoRules } from '../../inject/claude-rules.js';
import { createHostInstallUseCase } from '../../application/hosts/install-host.js';
import type { HostId } from '../../hosts/types.js';

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
  const installHost = createHostInstallUseCase();

  if (options.eject) {
    // Remove rule
    await ejectRules(options.target);
    return;
  }

  if (options.global) {
    const host = resolveGlobalHost(options);
    if (host) {
      const banners: Record<HostId, string> = {
        'claude-code': 'Installing global Claude Code adapter',
        codex: 'Injecting global Codex rules',
        cursor: 'Injecting global Cursor rules',
        opencode: 'Installing global OpenCode plugin',
        'project-claude': 'Injecting project Claude rules',
      };

      printBanner(banners[host], { color: chalk.cyan });
      const result = await installHost({ host, global: true, force: options.force, target: options.target });

      if (result.success) {
        console.log(chalk.green('✔ Installed into:'));
        if (result.path) {
          console.log(`  ${result.path}`);
        }
        console.log('');
        console.log(chalk.gray(result.summary));
        console.log('');
      } else {
        console.log(chalk.red('✖ Installation failed:'), result.error);
        console.log('');
      }
      return;
    }

    // Inject into global CLAUDE.md
    printBanner('Injecting global rules', { color: chalk.cyan });

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

  printBanner('Injecting project rules', { color: chalk.cyan });

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

function resolveGlobalHost(options: {
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  opencode?: boolean;
}): HostId | null {
  if (options.claudeCode) return 'claude-code';
  if (options.codex) return 'codex';
  if (options.cursor) return 'cursor';
  if (options.opencode) return 'opencode';
  return null;
}
