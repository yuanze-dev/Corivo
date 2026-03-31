/**
 * Linux systemd --user daemon management
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
const CORIVO_CONFIG_DIR = path.join(os.homedir(), '.corivo')
const LOG_FILE = path.join(CORIVO_CONFIG_DIR, 'daemon.log')
const ERR_FILE = path.join(CORIVO_CONFIG_DIR, 'daemon.err')

/**
 * Generate systemd unit file contents
 */
function generateUnitFile(config: ServiceConfig): string {
  // Parse command: if corivoBin contains spaces (such as "node /path/to/cli.js"),
  // Need to be split into executable file + parameter form of ExecStart
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
StandardOutput=append:${LOG_FILE}
StandardError=append:${ERR_FILE}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`
}

/**
 * Execute the systemctl --user command, ignoring non-zero exit codes (via ignoreError)
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
      // Make sure the ~/.config/systemd/user/ directory exists
      await fs.mkdir(SYSTEMD_USER_DIR, { recursive: true })

      // Write unit file
      const unitContent = generateUnitFile(config)
      await fs.writeFile(UNIT_FILE_PATH, unitContent, { mode: 0o644 })

      // Reload systemd configuration
      await systemctl(['daemon-reload'])

      // Set up auto-start at power on
      await systemctl(['enable', SERVICE_NAME])

      // Start service
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
      // Try to stop the service, if it fails, it will not be interrupted.
      await systemctl(['stop', SERVICE_NAME], true)

      // Try disabling auto-start at boot, but it will not be interrupted if it fails.
      await systemctl(['disable', SERVICE_NAME], true)

      // delete unit file
      await fs.unlink(UNIT_FILE_PATH).catch(() => {
        // File may not exist, ignore
      })

      // Reload systemd configuration
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
      // Check if unit file exists
      const loaded = await fs.access(UNIT_FILE_PATH).then(() => true).catch(() => false)

      if (!loaded) {
        return { running: false, loaded: false }
      }

      // Check if the service is in active state (exit 0 = running)
      const isActiveOutput = await systemctl(['is-active', SERVICE_NAME], true)
      const running = isActiveOutput.trim() === 'active'

      // Get MainPID
      let pid: number | undefined
      try {
        const showOutput = await systemctl(['show', SERVICE_NAME, '--property=MainPID'])
        const match = showOutput.match(/MainPID=(\d+)/)
        if (match) {
          const parsedPid = parseInt(match[1], 10)
          // A PID of 0 means the service is not running
          if (parsedPid > 0) pid = parsedPid
        }
      } catch {
        // Unable to get PID, ignored
      }

      return { running, loaded: true, pid }
    } catch {
      return { running: false, loaded: false }
    }
  }
}
