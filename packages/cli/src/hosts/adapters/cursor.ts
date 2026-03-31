import type { HostAdapter } from '../types.js';
import { installCursorHost, isCursorInstalled, uninstallCursorHost } from '../../inject/cursor-rules.js';

export const cursorHostAdapter: HostAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  capabilities: ['global-install', 'rules', 'hooks', 'doctor', 'uninstall'],
  install: async () => installCursorHost(),
  doctor: async () => isCursorInstalled(),
  uninstall: async () => uninstallCursorHost(),
};
