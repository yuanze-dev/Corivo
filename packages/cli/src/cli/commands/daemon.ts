/**
 * Daemon command - internal use only, invoked by the service manager.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { getConfigDir } from '../../storage/database.js'
import { createLogger } from '../../utils/logging.js'

export const daemonCommand = new Command('daemon')
const logger = createLogger()

daemonCommand
  .description('Internal use only, invoked by the service manager')

daemonCommand
  .command('run')
  .description('Run the heartbeat loop (invoked by the system, not intended for manual execution)')
  .action(async () => {
    const pidPath = path.join(getConfigDir(), 'heartbeat.pid')

    // Write its own PID for TUI hook (useDaemon.ts) to detect the survival status
    await fs.writeFile(pidPath, String(process.pid))

    // Parse the absolute path of dist/engine/heartbeat.js
    // After tsup packaging, import.meta.url points to dist/cli/index.js
    // ../engine/heartbeat.js is dist/engine/heartbeat.js
    const heartbeatPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../engine/heartbeat.js'
    )

    logger.log('[corivo] Starting heartbeat background worker...')

    // Start heartbeat as an independent child process and inherit the environment variables injected by launchd
    const child = spawn(process.execPath, [heartbeatPath], {
      env: process.env,
      stdio: 'inherit',
    })

    // When a signal is received, it is forwarded to the child process and the PID file is cleaned up.
    const cleanup = (signal: NodeJS.Signals) => {
      child.kill(signal)
    }
    process.once('SIGTERM', () => cleanup('SIGTERM'))
    process.once('SIGINT', () => cleanup('SIGINT'))

    // When the child process exits, clean the PID file and transparently transmit the exit code
    child.once('exit', async (code) => {
      await fs.unlink(pidPath).catch(() => {})
      process.exit(code ?? 1)
    })

    child.once('error', async (err) => {
      logger.error('[corivo] Failed to start heartbeat child process:', err)
      await fs.unlink(pidPath).catch(() => {})
      process.exit(1)
    })
  })

export default daemonCommand
