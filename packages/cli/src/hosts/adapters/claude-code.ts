import type { HostAdapter } from '../types.js';
import { installClaudeCodeHost, isClaudeCodeInstalled, uninstallClaudeCodeHost } from '../../inject/claude-host.js';

export const claudeCodeHostAdapter: HostAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  capabilities: ['global-install', 'hooks', 'rules', 'notify', 'doctor', 'uninstall'],
  install: async (options) => installClaudeCodeHost(options?.target),
  doctor: async (options) => isClaudeCodeInstalled(options?.target),
  uninstall: async (options) => uninstallClaudeCodeHost(options?.target),
};
