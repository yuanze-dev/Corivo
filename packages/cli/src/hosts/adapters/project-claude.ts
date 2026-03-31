import type { HostAdapter } from '../types.js';
import { installProjectClaudeHost, isProjectClaudeInstalled, uninstallProjectClaudeHost } from '../../inject/claude-rules.js';

export const projectClaudeHostAdapter: HostAdapter = {
  id: 'project-claude',
  displayName: 'Project Claude',
  capabilities: ['project-install', 'rules', 'doctor', 'uninstall'],
  install: async (options) => {
    if (options?.force || options?.global) {
      return installProjectClaudeHost(options?.target, options);
    }
    return installProjectClaudeHost(options?.target);
  },
  doctor: async (options) => isProjectClaudeInstalled(options?.target),
  uninstall: async (options) => uninstallProjectClaudeHost(options?.target),
};
