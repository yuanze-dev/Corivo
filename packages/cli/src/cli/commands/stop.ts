/**
 * CLI command - stop
 *
 * Stops the heartbeat daemon process.
 */

import { getServiceManager } from '../../service/index.js'

export async function stopCommand(): Promise<void> {
  const manager = getServiceManager()

  console.log('Stopping heartbeat daemon...')

  const result = await manager.uninstall()

  if (result.success) {
    console.log('✅ Heartbeat daemon stopped')
  } else {
    console.log(`❌ Stop failed: ${result.error}`)
  }
}
