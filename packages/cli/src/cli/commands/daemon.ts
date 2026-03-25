/**
 * Daemon 命令 - 内部使用，由 service manager 调用
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { getConfigDir } from '../../storage/database.js'
import { createTimestampLogger } from '../../utils/logging.js'

export const daemonCommand = new Command('daemon')
const logger = createTimestampLogger()

daemonCommand
  .description('内部使用，由 service manager 调用')

daemonCommand
  .command('run')
  .description('运行心跳循环（由系统调用，不应手动执行）')
  .action(async () => {
    const pidPath = path.join(getConfigDir(), 'heartbeat.pid')

    // 写入自身 PID，供 TUI hook（useDaemon.ts）检测存活状态
    await fs.writeFile(pidPath, String(process.pid))

    // 解析 dist/engine/heartbeat.js 的绝对路径
    // 在 tsup 打包后，import.meta.url 指向 dist/cli/index.js
    // ../engine/heartbeat.js 即为 dist/engine/heartbeat.js
    const heartbeatPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../engine/heartbeat.js'
    )

    logger.log('[corivo] 后台心跳启动中...')

    // 以独立子进程启动 heartbeat，继承 launchd 注入的环境变量
    const child = spawn(process.execPath, [heartbeatPath], {
      env: process.env,
      stdio: 'inherit',
    })

    // 收到信号时转发给子进程，并清理 PID 文件
    const cleanup = (signal: NodeJS.Signals) => {
      child.kill(signal)
    }
    process.once('SIGTERM', () => cleanup('SIGTERM'))
    process.once('SIGINT', () => cleanup('SIGINT'))

    // 子进程退出时清理 PID 文件并透传退出码
    child.once('exit', async (code) => {
      await fs.unlink(pidPath).catch(() => {})
      process.exit(code ?? 1)
    })

    child.once('error', async (err) => {
      logger.error('[corivo] 启动心跳子进程失败:', err)
      await fs.unlink(pidPath).catch(() => {})
      process.exit(1)
    })
  })

export default daemonCommand
