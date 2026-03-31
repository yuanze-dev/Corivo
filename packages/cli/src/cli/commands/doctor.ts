/**
 * CLI command-doctor
 *
 * health check
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { readPassword } from '../utils/password.js';

export async function doctorCommand(): Promise<void> {
  console.log('\n正在运行 Corivo 健康检查...\n');

  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.log('❌ 配置文件不存在');
    console.log('   请先运行: corivo init');
    return;
  }

  console.log('✅ 配置文件正常');

  // Check database
  const dbPath = getDefaultDatabasePath();
  let dbExists = false;

  try {
    await fs.access(dbPath);
    dbExists = true;
  } catch {}

  if (dbExists) {
    console.log('✅ 数据库文件存在');

    // Try to open the database
    try {
      const password = await readPassword('请输入主密码以验证数据库: ');
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const encryptedDbKey = config.encrypted_db_key;
      const dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);

      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
      const health = db.checkHealth();

      if (health.ok) {
        console.log('✅ 数据库完整性检查通过');

        const stats = db.getStats();
        console.log(`   存储了 ${stats.total} 个 block`);
      } else {
        console.log('❌ 数据库完整性检查失败');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.log(`❌ 数据库打开失败: ${error.message}`);
      } else {
        console.log('❌ 数据库打开失败');
      }
    }
  } else {
    console.log('⚠️  数据库文件不存在');
    console.log('   将在第一次使用时自动创建');
  }

  // Check daemon
  const pidPath = path.join(configDir, 'heartbeat.pid');
  try {
    const pidStr = await fs.readFile(pidPath, 'utf-8');
    const pid = parseInt(pidStr);
    process.kill(pid, 0);
    console.log(`✅ 心跳守护进程运行中 (PID: ${pid})`);
  } catch {
    console.log('⚪ 心跳守护进程未运行');
  }

  console.log('\n健康检查完成');
}
