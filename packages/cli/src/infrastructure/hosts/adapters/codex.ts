import type { HostAdapter } from '../types.js';
import { installCodexHost, isCodexInstalled, uninstallCodexHost } from '../installers/codex-rules.js';
import { importCodexHistory } from '../importers/codex-history.js';

export const codexHostAdapter: HostAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: ['global-install', 'rules', 'notify', 'plugin-file', 'doctor', 'uninstall', 'history-import'],
  install: async (options) => installCodexHost(options?.target),
  doctor: async (options) => isCodexInstalled(options?.target),
  uninstall: async (options) => uninstallCodexHost(options?.target),
  importHistory: async (options) => importCodexHistory(options),
};
