import type { HostAdapter } from '../types.js';
import { installCodexHost, isCodexInstalled, uninstallCodexHost } from '../../inject/codex-rules.js';

export const codexHostAdapter: HostAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: ['global-install', 'rules', 'notify', 'plugin-file', 'doctor', 'uninstall'],
  install: async () => installCodexHost(),
  doctor: async () => isCodexInstalled(),
  uninstall: async () => uninstallCodexHost(),
};
