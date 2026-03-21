/**
 * CLI 命令 - start
 *
 * 启动心跳守护进程（通过系统 service manager）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfigDir, getDefaultDatabasePath } from '../../storage/database.js'
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
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init')
  }

  const dbKey = config.db_key

  if (!dbKey && config.encrypted_db_key) {
    console.log('⚠️  检测到旧版配置格式（需要密码）')
    console.log('')
    console.log('Corivo v0.10+ 已移除密码系统，请按以下步骤迁移：')
    console.log('  1. 备份数据库：cp ~/.corivo/corivo.db ~/.corivo/corivo.db.backup')
    console.log('  2. 重新初始化：corivo init')
    return
  }

  if (!dbKey) {
    throw new ConfigError('配置文件无效：缺少 db_key')
  }

  const manager = getServiceManager()
  const corivoBin = await resolveCorivoBin()
  const dbPath = getDefaultDatabasePath()

  console.log('正在启动心跳守护进程...')

  const result = await manager.install({ corivoBin, dbKey, dbPath })

  if (result.success) {
    console.log('✅ 心跳守护进程已启动')
    console.log('\n日志路径:')
    console.log(`  stdout: ${path.join(configDir, 'daemon.log')}`)
    console.log(`  stderr: ${path.join(configDir, 'daemon.err')}`)
  } else {
    console.log(`❌ 启动失败: ${result.error}`)
    console.log('')
    console.log('你可以手动启动心跳：')
    console.log('  node ./dist/engine/heartbeat.js')
  }
}
