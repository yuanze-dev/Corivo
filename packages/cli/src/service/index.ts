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
 * 探测当前环境的 corivo 二进制路径。
 * 注意：fallback 中 process.cwd() 取决于用户执行 corivo 时的目录，
 * 这是继承自旧 daemon.ts 的开发模式假设。
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

  // fallback: 用 import.meta.url 定位当前文件，推导 cli/index.js 的绝对路径
  // dist/service/index.js → ../../dist/cli/index.js（与 cwd 无关）
  const thisFile = fileURLToPath(import.meta.url)
  const cliPath = path.resolve(path.dirname(thisFile), '..', 'cli', 'index.js')
  return `${process.execPath} ${cliPath}`
}
