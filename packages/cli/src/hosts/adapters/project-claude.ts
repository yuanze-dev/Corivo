import type { HostAdapter } from '../types.js';
import { installProjectClaudeHost, isProjectClaudeInstalled, uninstallProjectClaudeHost } from '../../inject/claude-rules.js';

export const projectClaudeHostAdapter: HostAdapter = {
  id: 'project-claude',
  displayName: 'Project Claude',
  capabilities: ['project-install', 'rules', 'doctor', 'uninstall'],
  install: async (options) => installProjectClaudeHost(options?.target),
  doctor: async (options) => isProjectClaudeInstalled(options?.target),
  uninstall: async (options) => uninstallProjectClaudeHost(options?.target),
};
