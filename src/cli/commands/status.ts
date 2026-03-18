/**
 * CLI 命令 - status
 *
 * 显示 Corivo 状态信息
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database';
import { KeyManager } from '../../crypto/keys';
import { ConfigError } from '../../errors';
import { readPassword } from './save';

export async function statusCommand(): Promise<void> {
  // 读取配置
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // 检查守护进程状态
  const pidPath = path.join(configDir, 'heartbeat.pid');
  let heartbeatRunning = false;
  try {
    if (await fs.stat(pidPath)) {
      const pid = parseInt(await fs.readFile(pidPath, 'utf-8'));
      // 检查进程是否存在
      process.kill(pid, 0);
      heartbeatRunning = true;
    }
  } catch {}

  // 解密数据库密钥
  const password = await readPassword('请输入主密码: ');
  const salt = Buffer.from(config.salt, 'base64');
  const masterKey = KeyManager.deriveMasterKey(password, salt);
  const encryptedDbKey = config.encrypted_db_key;
  const dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);

  // 打开数据库
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

  // 获取统计信息
  const stats = db.getStats();
  const health = db.checkHealth();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                      Corivo 状态');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📊 记忆统计:');
  console.log(`  总数: ${stats.total}`);
  console.log(`  活跃: ${stats.byStatus.active || 0}`);
  console.log(`  冷却: ${stats.byStatus.cooling || 0}`);
  console.log(`  冷冻: ${stats.byStatus.cold || 0}`);
  console.log(`  归档: ${stats.byStatus.archived || 0}`);

  console.log('\n🏷️  标注分布:');
  for (const [annotation, count] of Object.entries(stats.byAnnotation)) {
    console.log(`  ${annotation}: ${count}`);
  }

  console.log('\n💾 数据库:');
  console.log(`  路径: ${dbPath}`);
  console.log(`  状态: ${health.ok ? '✅ 正常' : '❌ 异常'}`);
  if (health.size) {
    console.log(`  大小: ${(health.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n⚡ 心跳守护进程:');
  console.log(`  状态: ${heartbeatRunning ? '🟢 运行中' : '⚪ 未启动'}`);

  console.log('\n下一步：');
  console.log('  corivo save --content "..." --annotation "..."');
  console.log('  corivo query "..."');
  console.log('  corivo start | stop');
}
