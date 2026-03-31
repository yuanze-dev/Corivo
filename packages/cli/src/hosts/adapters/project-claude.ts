import type { HostAdapter } from '../types.js';
import { getProjectClaudeDoctorResult, installProjectClaudeHost, uninstallProjectClaudeHost } from '../../inject/claude-rules.js';

export const projectClaudeHostAdapter: HostAdapter = {
  id: 'project-claude',
  displayName: 'Project Claude',
  capabilities: ['project-install', 'rules', 'doctor'],
  install: async (options) => installProjectClaudeHost(options.target),
  doctor: async (options) => getProjectClaudeDoctorResult(options.target),
  uninstall: async (options) => uninstallProjectClaudeHost(options.target),
};
