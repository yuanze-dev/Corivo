import type { HostAdapter } from '../types.js';
import { installCursorHost, isCursorInstalled, uninstallCursorHost } from '../installers/cursor-rules.js';

export const cursorHostAdapter: HostAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  capabilities: ['global-install', 'rules', 'hooks', 'doctor', 'uninstall'],
  install: async (options) => installCursorHost(options?.target),
  doctor: async (options) => isCursorInstalled(options?.target),
  uninstall: async (options) => uninstallCursorHost(options?.target),
};
