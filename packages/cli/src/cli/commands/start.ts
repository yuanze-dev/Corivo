/**
 * CLI command - start
 *
 * Starts the heartbeat daemon process via the system service manager.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfigDir, getDefaultDatabasePath } from '@/infrastructure/storage/lifecycle/database-paths.js'
import { ConfigError } from '../../errors/index.js'
import { getServiceManager, resolveCorivoBin } from '@/infrastructure/platform/index.js'
import { getCliOutput } from '@/cli/runtime'

export async function startCommand(): Promise<void> {
  const output = getCliOutput()
  const configDir = getConfigDir()
  const configPath = path.join(configDir, 'config.json')

  let config
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    config = JSON.parse(content)
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init')
  }

  if (config.encrypted_db_key) {
    output.warn('⚠️  Detected legacy config format (password-based)')
    output.info('')
    output.info('Corivo v0.10+ removed the password system. Please migrate using these steps:')
    output.info('  1. Back up the database: cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup')
    output.info('  2. Re-initialize: corivo init')
    return
  }

  const manager = getServiceManager()
  const corivoBin = await resolveCorivoBin()
  const dbPath = getDefaultDatabasePath()

  output.info('Starting heartbeat daemon...')

  const result = await manager.install({ corivoBin, dbPath })

  if (result.success) {
    output.success('✅ Heartbeat daemon started')
    output.info('\nLog paths:')
    output.info(`  stdout: ${path.join(configDir, 'daemon.log')}`)
    output.info(`  stderr: ${path.join(configDir, 'daemon.err')}`)
  } else {
    output.error(`❌ Start failed: ${result.error}`)
    output.info('')
    output.info('You can start heartbeat manually:')
    output.info('  node ./dist/engine/heartbeat.js')
  }
}
