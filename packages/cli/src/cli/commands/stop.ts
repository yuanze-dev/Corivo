/**
 * CLI command - stop
 *
 * Stops the heartbeat daemon process.
 */

import { getServiceManager } from '../../service/index.js'
import { createCliContext } from '../context/create-context.js'

export async function stopCommand(): Promise<void> {
  const context = createCliContext()
  const output = context.output
  const manager = getServiceManager()

  output.info('Stopping heartbeat daemon...')

  const result = await manager.uninstall()

  if (result.success) {
    output.success('✅ Heartbeat daemon stopped')
  } else {
    output.error(`❌ Stop failed: ${result.error}`)
  }
}
