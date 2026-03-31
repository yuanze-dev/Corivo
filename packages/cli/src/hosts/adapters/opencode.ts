import type { HostAdapter } from '../types.js';
import { installOpencodeHost, isOpencodeInstalled, uninstallOpencodeHost } from '../../inject/opencode-plugin.js';

export const opencodeHostAdapter: HostAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  capabilities: ['global-install', 'rules', 'notify', 'doctor', 'uninstall'],
  install: async () => installOpencodeHost(),
  doctor: async () => isOpencodeInstalled(),
  uninstall: async () => uninstallOpencodeHost(),
};
