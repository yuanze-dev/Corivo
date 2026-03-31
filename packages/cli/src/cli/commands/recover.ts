/**
 * CLI command-recover
 *
 * Key recovery process
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

export async function recoverCommand(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                      数据恢复向导');
  console.log('═══════════════════════════════════════════════════════\n');

  // Check configuration file
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('配置文件不存在。如果您是首次使用，请运行: corivo init');
  }

  console.log('请选择恢复方式:\n');
  console.log('  [1] 使用恢复密钥（24 个单词，BIP39 标准）');
  console.log('  [2] 退出\n');

  const choice = await readPassword('请选择 [1-2]: ');

  if (choice !== '1') {
    console.log('已取消');
    return;
  }

  // Enter recovery key
  console.log('\n请输入您的恢复密钥（24 个单词，用空格分隔）:\n');

  const recoveryKey = await readPassword('恢复密钥: ');
  const inputWords = recoveryKey.trim().split(/\s+/);

  if (inputWords.length !== 24) {
    console.log('❌ 恢复密钥必须是 24 个单词');
    return;
  }

  // Verify recovery key
  console.log('\n正在验证恢复密钥...');

  try {
    KeyManager.deriveFromRecoveryKey(recoveryKey);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`❌ ${error.message}`);
    } else {
      console.log('❌ 恢复密钥验证失败');
    }
    return;
  }

  console.log('✅ 恢复密钥验证通过');

  // Set new password
  console.log('\n请设置新的主密码（至少 8 位，包含字母和数字）\n');

  const password1 = await readPassword('新密码: ');
  if (!KeyManager.validatePasswordStrength(password1)) {
    console.log('❌ 密码强度不足');
    return;
  }

  const password2 = await readPassword('确认新密码: ');
  if (password1 !== password2) {
    console.log('❌ 两次输入的密码不一致');
    return;
  }

  // Regenerate key
  console.log('\n正在重新生成密钥链...');

  const salt = KeyManager.generateSalt();
  const newMasterKey = KeyManager.deriveMasterKey(password1, salt);
  const dbKey = KeyManager.generateDatabaseKey();
  const encryptedDbKey = KeyManager.encryptDatabaseKey(dbKey, newMasterKey);

  // Update configuration
  const newConfig = {
    ...config,
    salt: salt.toString('base64'),
    encrypted_db_key: encryptedDbKey,
    recovered_at: new Date().toISOString(),
  };

  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  // Verify database
  const dbPath = getDefaultDatabasePath();
  try {
    const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    const health = db.checkHealth();

    if (health.ok) {
      console.log('✅ 数据库验证通过');
      const stats = db.getStats();
      console.log(`   已恢复 ${stats.total} 个 block`);
    } else {
      console.log('❌ 数据库验证失败');
      console.log('   请从其他设备同步最新数据');
    }
  } catch {
    console.log('⚠️  无法打开数据库');
    console.log('   请从其他设备同步最新数据');
  }

  // Generate new recovery key
  const newRecoveryKey = KeyManager.generateRecoveryKey(newMasterKey);
  const recoveryWords = newRecoveryKey.split(' ');

  console.log('\n密钥链已更新！');
  console.log('\n⚠️  重要：您的新恢复密钥已生成（24 个单词）\n');

  console.log(`  ${recoveryWords.slice(0, 6).join('  ')}`);
  console.log(`  ${recoveryWords.slice(6, 12).join('  ')}`);
  console.log(`  ${recoveryWords.slice(12, 18).join('  ')}`);
  console.log(`  ${recoveryWords.slice(18, 24).join('  ')}`);

  console.log('\n⚠️  旧恢复密钥已失效，请保存新的恢复密钥');

  console.log('\n下一步：');
  console.log('  在其他设备上重新授权（设备列表已重置）');
}
