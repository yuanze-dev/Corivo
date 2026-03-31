import type { HostAdapter } from '../types.js';
import { installCodexHost, isCodexInstalled, uninstallCodexHost } from '../../inject/codex-rules.js';

export const codexHostAdapter: HostAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: ['global-install', 'rules', 'notify', 'plugin-file', 'doctor', 'uninstall'],
  install: async (options) => installCodexHost(options?.target),
  doctor: async (options) => isCodexInstalled(options?.target),
  uninstall: async (options) => uninstallCodexHost(options?.target),
};
