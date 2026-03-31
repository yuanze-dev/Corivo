import type { HostAdapter } from '../types.js';
import { installClaudeCodeHost, isClaudeCodeInstalled, uninstallClaudeCodeHost } from '../../inject/claude-host.js';

export const claudeCodeHostAdapter: HostAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  capabilities: ['global-install', 'hooks', 'rules', 'notify', 'doctor', 'uninstall'],
  install: async () => installClaudeCodeHost(),
  doctor: async () => isClaudeCodeInstalled(),
  uninstall: async () => uninstallClaudeCodeHost(),
};
