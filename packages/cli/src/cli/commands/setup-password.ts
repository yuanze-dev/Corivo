/**
 * CLI 命令 - setup-password
 *
 * 设置主密码，用于数据库加密和跨设备身份验证
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { KeyManager } from '../../crypto/keys.js';
import { getConfigDir } from '../../storage/database.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

interface SetupPasswordOptions {
  force?: boolean;
}

export async function setupPasswordCommand(options: SetupPasswordOptions = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  // 读取现有配置
  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // 检查是否已设置密码
  const hasPassword = config.encrypted_db_key !== undefined;

  if (hasPassword && !options.force) {
    console.log(chalk.yellow('\\n⚠️  已设置主密码'));
    console.log(chalk.gray('如需修改密码，请使用: corivo setup-password --force\\n'));
    return;
  }

  console.log('\\n═══════════════════════════════════════════════════════');
  console.log('           设置主密码');
  console.log('═══════════════════════════════════════════════════════\\n');

  console.log('主密码用于：');
  console.log('  • 数据库加密保护（云同步安全）');
  console.log('  • 跨设备身份验证');
  console.log('  • 身份恢复凭据\\n');

  console.log(chalk.gray('提示：'));
  console.log(chalk.gray('  • 密码至少 8 个字符，包含字母和数字'));
  console.log(chalk.gray('  • 请使用容易记住但不易被猜到的密码'));
  console.log(chalk.gray('  • 忘记密码无法找回，请妥善保管\\n'));

  // 如果已有密码，需要先验证
  if (hasPassword && options.force) {
    const oldPassword = await readPassword('请输入当前密码: ');
    const salt = Buffer.from(config.salt, 'base64');
    const masterKey = KeyManager.deriveMasterKey(oldPassword, salt);

    try {
      KeyManager.decryptDatabaseKey(config.encrypted_db_key, masterKey);
    } catch {
      throw new ValidationError('当前密码错误');
    }
  }

  // 输入新密码
  const newPassword = await readPassword('请输入新密码: ');
  if (!KeyManager.validatePasswordStrength(newPassword)) {
    throw new ValidationError('密码强度不足：至少 8 个字符，包含字母和数字');
  }

  const confirmPassword = await readPassword('请确认密码: ');
  if (newPassword !== confirmPassword) {
    throw new ValidationError('两次输入的密码不一致');
  }

  // 生成新的加密密钥
  const salt = KeyManager.generateSalt();
  const masterKey = KeyManager.deriveMasterKey(newPassword, salt);

  // 生成新的数据库密钥
  const dbKey = KeyManager.generateDatabaseKey();
  const encryptedDbKey = KeyManager.encryptDatabaseKey(dbKey, masterKey);

  // 更新配置
  config.salt = salt.toString('base64');
  config.encrypted_db_key = encryptedDbKey;

  // 移除明文密钥
  if (config.db_key) {
    delete config.db_key;
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green('\\n✅ 主密码设置成功！\\n'));
  console.log(chalk.gray('从现在起，每次使用 Corivo 时需要输入密码。'));
  console.log(chalk.gray('数据库内容已加密保护。\\n'));
}
