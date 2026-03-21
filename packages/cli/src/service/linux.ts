/**
 * Linux systemd --user 守护进程管理
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

const execFileAsync = promisify(execFile)

const SERVICE_NAME = 'com.corivo.daemon'
const UNIT_FILE_NAME = `${SERVICE_NAME}.service`
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user')
const UNIT_FILE_PATH = path.join(SYSTEMD_USER_DIR, UNIT_FILE_NAME)

/**
 * 生成 systemd unit 文件内容
 */
function generateUnitFile(config: ServiceConfig): string {
  // 解析命令：如果 corivoBin 包含空格（如 "node /path/to/cli.js"），
  // 需要拆分为 ExecStart 的可执行文件 + 参数形式
  const parts = config.corivoBin.trim().split(/\s+/)
  const execParts = [...parts, 'daemon', 'run']
  const execStart = execParts.join(' ')

  return `[Unit]
Description=Corivo Heartbeat Daemon
After=default.target

[Service]
Type=simple
ExecStart=${execStart}
Environment=CORIVO_DB_KEY=${config.dbKey}
Environment=CORIVO_DB_PATH=${config.dbPath}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`
}

/**
 * 执行 systemctl --user 命令，忽略非零退出码（通过 ignoreError）
 */
async function systemctl(args: string[], ignoreError = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync('systemctl', ['--user', ...args], {
      encoding: 'utf-8',
    })
    return stdout
  } catch (error) {
    if (ignoreError) return ''
    throw error
  }
}

export class LinuxServiceManager implements ServiceManager {
  isSupported(): boolean {
    return true
  }

  async install(config: ServiceConfig): Promise<ServiceResult> {
    try {
      // 确保 ~/.config/systemd/user/ 目录存在
      await fs.mkdir(SYSTEMD_USER_DIR, { recursive: true })

      // 写入 unit 文件
      const unitContent = generateUnitFile(config)
      await fs.writeFile(UNIT_FILE_PATH, unitContent, { mode: 0o644 })

      // 重新加载 systemd 配置
      await systemctl(['daemon-reload'])

      // 设置开机自启
      await systemctl(['enable', SERVICE_NAME])

      // 启动服务
      await systemctl(['start', SERVICE_NAME])

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async uninstall(): Promise<ServiceResult> {
    try {
      // 尝试停止服务，失败不中断
      await systemctl(['stop', SERVICE_NAME], true)

      // 尝试禁用开机自启，失败不中断
      await systemctl(['disable', SERVICE_NAME], true)

      // 删除 unit 文件
      await fs.unlink(UNIT_FILE_PATH).catch(() => {
        // 文件可能不存在，忽略
      })

      // 重新加载 systemd 配置
      await systemctl(['daemon-reload'], true)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      // 检查 unit 文件是否存在
      const loaded = await fs.access(UNIT_FILE_PATH).then(() => true).catch(() => false)

      if (!loaded) {
        return { running: false, loaded: false }
      }

      // 检查服务是否处于 active 状态（exit 0 = running）
      const isActiveOutput = await systemctl(['is-active', SERVICE_NAME], true)
      const running = isActiveOutput.trim() === 'active'

      // 获取 MainPID
      let pid: number | undefined
      try {
        const showOutput = await systemctl(['show', SERVICE_NAME, '--property=MainPID'])
        const match = showOutput.match(/MainPID=(\d+)/)
        if (match) {
          const parsedPid = parseInt(match[1], 10)
          // PID 为 0 表示服务未运行
          if (parsedPid > 0) pid = parsedPid
        }
      } catch {
        // 无法获取 PID，忽略
      }

      return { running, loaded: true, pid }
    } catch {
      return { running: false, loaded: false }
    }
  }
}
