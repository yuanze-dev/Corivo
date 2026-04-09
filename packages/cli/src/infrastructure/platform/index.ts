import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ServiceManager } from './types.js'
import { MacOSServiceManager } from './macos.js'
import { LinuxServiceManager } from './linux.js'
import { UnsupportedServiceManager } from './unsupported.js'

export * from './types.js'
export { MacOSServiceManager } from './macos.js'
export { LinuxServiceManager } from './linux.js'
export { UnsupportedServiceManager } from './unsupported.js'

export function getServiceManager(): ServiceManager {
  switch (process.platform) {
    case 'darwin':
      return new MacOSServiceManager()
    case 'linux':
      return new LinuxServiceManager()
    default:
      return new UnsupportedServiceManager()
  }
}

/**
 * Detect the corivo binary path of the current environment.
 * Note: process.cwd() in fallback depends on the directory when the user executes corivo.
 * This is a development model assumption inherited from the old daemon.ts.
 */
export async function resolveCorivoBin(): Promise<string> {
  const candidates = [
    process.env.CORIVO_BIN,
    path.join(process.cwd(), 'bin', 'corivo'),
    path.join(os.homedir(), '.corivo', 'bin', 'corivo'),
  ]

  for (const p of candidates) {
    if (p && (await fs.access(p).then(() => true).catch(() => false))) {
      return p
    }
  }

  // fallback: Use import.meta.url to locate the current file and deduce the absolute path of cli/run.js
  // dist/service/index.js → ../../dist/cli/run.js (not related to cwd)
  const thisFile = fileURLToPath(import.meta.url)
  const cliPath = path.resolve(path.dirname(thisFile), '..', 'cli', 'run.js')
  return `${process.execPath} ${cliPath}`
}
