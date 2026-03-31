/**
 * CLI command - start
 *
 * Starts the heartbeat daemon process via the system service manager.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfigDir, getDefaultDatabasePath } from '@/storage/database'
import { ConfigError } from '../../errors/index.js'
import { getServiceManager, resolveCorivoBin } from '../../service/index.js'

export async function startCommand(): Promise<void> {
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
    console.log('⚠️  Detected legacy config format (password-based)')
    console.log('')
    console.log('Corivo v0.10+ removed the password system. Please migrate using these steps:')
    console.log('  1. Back up the database: cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup')
    console.log('  2. Re-initialize: corivo init')
    return
  }

  const manager = getServiceManager()
  const corivoBin = await resolveCorivoBin()
  const dbPath = getDefaultDatabasePath()

  console.log('Starting heartbeat daemon...')

  const result = await manager.install({ corivoBin, dbPath })

  if (result.success) {
    console.log('✅ Heartbeat daemon started')
    console.log('\nLog paths:')
    console.log(`  stdout: ${path.join(configDir, 'daemon.log')}`)
    console.log(`  stderr: ${path.join(configDir, 'daemon.err')}`)
  } else {
    console.log(`❌ Start failed: ${result.error}`)
    console.log('')
    console.log('You can start heartbeat manually:')
    console.log('  node ./dist/engine/heartbeat.js')
  }
}
