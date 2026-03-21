/**
 * macOS launchd 守护进程管理
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js'

const PLIST_NAME = 'com.corivo.daemon.plist'
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME)

/**
 * 生成 launchd plist 文件内容
 */
function generatePlist(config: ServiceConfig): string {
  // 解析命令：如果是 "node /path/to/cli.js" 格式，拆分为数组
  let programArgs: string[]
  if (config.corivoBin.includes('node ') || config.corivoBin.includes('nodejs ')) {
    const parts = config.corivoBin.trim().split(/\s+/)
    programArgs = [...parts, 'daemon', 'run']
  } else {
    programArgs = [config.corivoBin, 'daemon', 'run']
  }

  const programArgsXml = programArgs.map(arg => `    <string>${arg}</string>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.corivo.daemon</string>

  <key>ProgramArguments</key>
  <array>
${programArgsXml}
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>CORIVO_DB_KEY</key>
    <string>${config.dbKey}</string>
    <key>CORIVO_DB_PATH</key>
    <string>${config.dbPath}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>

  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.log')}</string>

  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), '.corivo', 'daemon.err')}</string>

  <key>ProcessType</key>
  <string>Interactive</string>

</dict>
</plist>
`
}

export class MacOSServiceManager implements ServiceManager {
  isSupported(): boolean {
    return process.platform === 'darwin'
  }

  async install(config: ServiceConfig): Promise<ServiceResult> {
    try {
      // 确保 LaunchAgents 目录存在
      await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true })

      // 写入 plist 文件
      const plistContent = generatePlist(config)
      await fs.writeFile(PLIST_PATH, plistContent, { mode: 0o644 })

      // 加载服务
      execSync(`launchctl load "${PLIST_PATH}"`, { encoding: 'utf-8' })

      // 启动服务
      execSync(`launchctl start com.corivo.daemon`, { encoding: 'utf-8' })

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
      // 尝试停止服务
      try {
        execSync(`launchctl stop com.corivo.daemon`, { encoding: 'utf-8' })
      } catch {
        // 服务可能没有运行，忽略
      }

      // 尝试卸载服务
      try {
        execSync(`launchctl unload "${PLIST_PATH}"`, { encoding: 'utf-8' })
      } catch {
        // 服务可能没有加载，忽略
      }

      // 删除 plist 文件
      await fs.unlink(PLIST_PATH).catch(() => {
        // 文件可能不存在，忽略
      })

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
      // 检查 plist 文件是否存在
      const loaded = await fs.access(PLIST_PATH).then(() => true).catch(() => false)

      if (!loaded) {
        return { running: false, loaded: false }
      }

      // 尝试获取 PID
      const output = execSync(`launchctl list | grep com.corivo.daemon`, {
        encoding: 'utf-8',
      })

      // 输出格式: "PID\texit_code\tcom.corivo.daemon"
      const match = output.match(/^(\d+)\s+\d+\s+com\.corivo\.daemon/)
      const pid = match ? parseInt(match[1], 10) : undefined

      // 如果 PID 是 "-" 或没有，说明服务没有运行
      const running = pid !== undefined && pid > 0

      return { running, loaded: true, pid }
    } catch {
      return { running: false, loaded: false }
    }
  }
}
