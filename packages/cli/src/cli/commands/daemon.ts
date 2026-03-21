/**
 * Daemon 命令 - 内部使用，由 service manager 调用
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { getConfigDir } from '../../storage/database.js'

export const daemonCommand = new Command('daemon')

daemonCommand
  .description('内部使用，由 service manager 调用')

daemonCommand
  .command('run')
  .description('运行心跳循环（由系统调用，不应手动执行）')
  .action(async () => {
    const pidPath = path.join(getConfigDir(), 'heartbeat.pid')

    // 写入 PID 文件，供 TUI hook（useDaemon.ts）检测存活状态
    await fs.writeFile(pidPath, String(process.pid))

    // 关闭时删除 PID 文件
    const cleanup = async () => {
      await fs.unlink(pidPath).catch(() => {})
      process.exit(0)
    }
    process.once('SIGTERM', cleanup)
    process.once('SIGINT', cleanup)

    try {
      const { Heartbeat } = await import('../../engine/heartbeat.js')
      const heartbeat = new Heartbeat()

      console.log('[corivo] 后台心跳启动中...')
      console.log('[corivo] 我会一直在后台默默工作。')

      await heartbeat.start()
      // heartbeat.start() 是无限循环，正常不会返回。
      // 若意外返回（测试或未来改动），也确保 PID 文件被清理。
      await cleanup()
    } catch (error) {
      console.error('[corivo] 后台心跳启动失败:', error)
      await fs.unlink(pidPath).catch(() => {})
      process.exit(1)
    }
  })

export default daemonCommand
