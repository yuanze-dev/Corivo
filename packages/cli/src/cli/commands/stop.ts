/**
 * CLI command - stop
 *
 * Stops the heartbeat daemon process.
 */

import { getServiceManager } from '@/infrastructure/platform/index.js'
import { getCliOutput } from '@/cli/runtime'

export async function stopCommand(): Promise<void> {
  const output = getCliOutput()
  const manager = getServiceManager()

  output.info('Stopping heartbeat daemon...')

  const result = await manager.uninstall()

  if (result.success) {
    output.success('✅ Heartbeat daemon stopped')
  } else {
    output.error(`❌ Stop failed: ${result.error}`)
  }
}
