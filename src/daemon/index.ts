/**
 * Daemon 模块 - 守护进程管理
 */

export * from './macos.js';

import { isSupported } from './macos.js';

/**
 * 获取平台特定的守护进程管理器
 */
export function getDaemonManager() {
  if (isSupported()) {
    return import('./macos.js');
  }
  return null;
}
