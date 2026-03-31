/**
 * macOS launchd daemon management
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
 * Generate launchd plist file content
 */
function generatePlist(config: ServiceConfig): string {
  // Parsing command: If it is "node /path/to/cli.js" format, split into an array
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
      // Make sure the LaunchAgents directory exists
      await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true })

      // Write to plist file
      const plistContent = generatePlist(config)
      await fs.writeFile(PLIST_PATH, plistContent, { mode: 0o644 })

      // Loading services
      execSync(`launchctl load "${PLIST_PATH}"`, { encoding: 'utf-8' })

      // Start service
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
      // Try to stop the service
      try {
        execSync(`launchctl stop com.corivo.daemon`, { encoding: 'utf-8' })
      } catch {
        // The service may not be running, ignore
      }

      // Try to uninstall the service
      try {
        execSync(`launchctl unload "${PLIST_PATH}"`, { encoding: 'utf-8' })
      } catch {
        // The service may not be loaded, ignore
      }

      // delete plist file
      await fs.unlink(PLIST_PATH).catch(() => {
        // File may not exist, ignore
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
      // Check if plist file exists
      const loaded = await fs.access(PLIST_PATH).then(() => true).catch(() => false)

      if (!loaded) {
        return { running: false, loaded: false }
      }

      // Try to get PID
      const output = execSync(`launchctl list | grep com.corivo.daemon`, {
        encoding: 'utf-8',
      })

      // Output format: "PID\texit_code\tcom.corivo.daemon"
      const match = output.match(/^(\d+)\s+\d+\s+com\.corivo\.daemon/)
      const pid = match ? parseInt(match[1], 10) : undefined

      // If the PID is "-" or none, the service is not running
      const running = pid !== undefined && pid > 0

      return { running, loaded: true, pid }
    } catch {
      return { running: false, loaded: false }
    }
  }
}
