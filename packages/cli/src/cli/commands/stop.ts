/**
 * CLI 命令 - stop
 *
 * 停止心跳守护进程
 */

import { getServiceManager } from '../../service/index.js'

export async function stopCommand(): Promise<void> {
  const manager = getServiceManager()

  console.log('正在停止心跳守护进程...')

  const result = await manager.uninstall()

  if (result.success) {
    console.log('✅ 心跳守护进程已停止')
  } else {
    console.log(`❌ 停止失败: ${result.error}`)
  }
}
