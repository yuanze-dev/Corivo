import type { HostAdapter } from '../types.js';
import { installClaudeCodeHost, isClaudeCodeInstalled, uninstallClaudeCodeHost } from '../installers/claude-host.js';
import { importClaudeHistory } from '../importers/claude-history.js';

export const claudeCodeHostAdapter: HostAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  capabilities: ['global-install', 'hooks', 'rules', 'notify', 'doctor', 'uninstall', 'history-import'],
  install: async (options) => installClaudeCodeHost(options?.target),
  doctor: async (options) => isClaudeCodeInstalled(options?.target),
  uninstall: async (options) => uninstallClaudeCodeHost(options?.target),
  importHistory: async (options) => importClaudeHistory(options),
};
