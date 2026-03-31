/**
 * CLI command - inject
 *
 * Injects Corivo rules into project configuration files.
 */

import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import { printBanner } from '@/utils/banner';
import { createHostInstallUseCase } from '../../application/hosts/install-host.js';
import { createHostUninstallUseCase } from '../../application/hosts/uninstall-host.js';
import type { HostId, HostInstallResult } from '../../hosts/types.js';

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
  const host = resolveHost(options);
  const target = resolveTarget(options, host);
  const request = { host, target, force: options.force, global: options.global };

  if (options.eject) {
    printBanner(resolveBanner(host, options, 'uninstall'), { color: chalk.cyan });
    const uninstallHost = createHostUninstallUseCase();
    const result = await uninstallHost(request);
    renderResult({ host, action: 'uninstall', result });
    return;
  }

  printBanner(resolveBanner(host, options, 'install'), { color: chalk.cyan });
  const installHost = createHostInstallUseCase();
  const result = await installHost(request);
  renderResult({ host, action: 'install', result });
}

// Export for CLI use
export default { injectCommand };

function resolveHost(options: {
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  opencode?: boolean;
}): HostId {
  if (options.claudeCode) return 'claude-code';
  if (options.codex) return 'codex';
  if (options.cursor) return 'cursor';
  if (options.opencode) return 'opencode';
  return 'project-claude';
}

function resolveTarget(options: { target?: string; global?: boolean }, host: HostId): string | undefined {
  if (options.target) {
    return options.target;
  }

  if (host === 'project-claude' && options.global) {
    return path.join(os.homedir(), '.claude');
  }

  return undefined;
}

function resolveBanner(
  host: HostId,
  options: { global?: boolean },
  action: 'install' | 'uninstall'
): string {
  if (host === 'project-claude') {
    if (action === 'uninstall') {
      return 'Removing Corivo rules';
    }
    return options.global ? 'Injecting global rules' : 'Injecting project rules';
  }

  if (action === 'uninstall') {
    const uninstallBanners: Record<Exclude<HostId, 'project-claude'>, string> = {
      'claude-code': 'Uninstalling Claude Code adapter',
      codex: 'Uninstalling Codex rules',
      cursor: 'Uninstalling Cursor rules',
      opencode: 'Uninstalling OpenCode plugin',
    };
    return uninstallBanners[host];
  }

  const installBanners: Record<Exclude<HostId, 'project-claude'>, string> = {
    'claude-code': 'Installing global Claude Code adapter',
    codex: 'Injecting global Codex rules',
    cursor: 'Injecting global Cursor rules',
    opencode: 'Installing global OpenCode plugin',
  };
  return installBanners[host];
}

function renderResult(input: {
  host: HostId;
  action: 'install' | 'uninstall';
  result: HostInstallResult;
}): void {
  const { host, action, result } = input;

  if (!result.success) {
    const failurePrefix = resolveFailurePrefix(host, action);
    console.log(chalk.red(failurePrefix), result.error || result.summary);
    console.log('');
    return;
  }

  if (host === 'project-claude') {
    if (action === 'install') {
      console.log(chalk.green('✔ Rules injected into:'));
      if (result.path) {
        console.log(`  ${result.path}`);
      }
      console.log('');
      console.log(chalk.gray('Claude Code will now automatically use Corivo memory features'));
      console.log('');
      return;
    }

    console.log(chalk.green('✔ Corivo rules removed'));
    console.log('');
    return;
  }

  console.log(chalk.green(action === 'install' ? '✔ Installed into:' : '✔ Uninstalled from:'));
  if (result.path) {
    console.log(`  ${result.path}`);
  }
  console.log('');
  console.log(chalk.gray(result.summary));
  console.log('');
}

function resolveFailurePrefix(host: HostId, action: 'install' | 'uninstall'): string {
  if (host === 'project-claude') {
    return action === 'install' ? '✖ Injection failed:' : '✖ Removal failed:';
  }
  return action === 'install' ? '✖ Installation failed:' : '✖ Uninstall failed:';
}
