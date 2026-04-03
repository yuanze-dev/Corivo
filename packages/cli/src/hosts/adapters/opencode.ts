import type { HostAdapter } from '../types.js';
import { installOpencodeHost, isOpencodeInstalled, uninstallOpencodeHost } from '../installers/opencode-plugin.js';

export const opencodeHostAdapter: HostAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  capabilities: ['global-install', 'rules', 'notify', 'doctor', 'uninstall'],
  install: async (options) => installOpencodeHost(options?.target),
  doctor: async (options) => isOpencodeInstalled(options?.target),
  uninstall: async (options) => uninstallOpencodeHost(options?.target),
};
