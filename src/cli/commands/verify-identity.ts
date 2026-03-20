/**
 * CLI 命令 - verify-identity
 *
 * 跨设备身份验证（指纹 + 密码联合验证）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { KeyManager } from '../../crypto/keys.js';
import { JointVerifier } from '../../identity/auth.js';
import { IdentityManager } from '../../identity/identity.js';
import { DynamicFingerprintCollector, initializeDefaultSoftwareConfigs } from '../../identity/collector.js';
import { getConfigDir } from '../../storage/database.js';
import { ConfigError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';

interface VerifyIdentityOptions {
  password?: string;
  verbose?: boolean;
}

export async function verifyIdentityCommand(options: VerifyIdentityOptions = {}): Promise<void> {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');
  const identityPath = path.join(configDir, 'identity.json');

  // 读取配置
  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // 读取身份
  let identity: any;
  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    identity = JSON.parse(content);
  } catch {
    throw new ConfigError('未找到身份信息。请先运行: corivo init');
  }

  console.log('\\n═══════════════════════════════════════════════════════');
  console.log('           跨设备身份验证');
  console.log('═══════════════════════════════════════════════════════\\n');

  // 显示当前身份信息
  console.log(chalk.gray('当前身份 ID: ') + chalk.white(identity.identity_id));
  console.log(chalk.gray('创建时间: ') + chalk.gray(new Date(identity.created_at).toLocaleString('zh-CN')));
  console.log();

  // 初始化指纹采集器
  initializeDefaultSoftwareConfigs();
  const currentFingerprints = await DynamicFingerprintCollector.collectAll();
  const fingerprintValues = currentFingerprints.map(fp => fp.value);

  console.log(chalk.cyan(`📸 采集到 ${currentFingerprints.length} 个指纹:`));
  for (const fp of currentFingerprints) {
    const confidence = fp.confidence === 'high' ? '🔴' : fp.confidence === 'medium' ? '🟡' : '🟢';
    console.log(`  ${confidence} ${fp.platform}: ${fp.value.substring(0, 8)}...`);
  }
  console.log();

  // 加载目标身份
  const identityManager = new IdentityManager(configDir);
  await identityManager.load();

  // 匹配指纹
  const matchResult = identityManager.matchIdentity(currentFingerprints);

  console.log(chalk.cyan('🔍 指纹匹配结果:'));
  console.log(`  匹配分数: ${(matchResult.confidence * 100).toFixed(0)}/100`);
  console.log(`  匹配平台: ${matchResult.matched_platforms.join(', ') || '无'}`);
  console.log(`  匹配状态: ${matchResult.matched ? chalk.green('✓ 匹配') : chalk.red('✗ 不匹配')}`);
  console.log();

  // 如果指纹匹配不足，请求密码验证
  if (!matchResult.matched || matchResult.confidence < 0.6) {
    console.log(chalk.yellow('⚠️  指纹匹配不足，需要密码验证\\n'));

    // 如果设置了密码
    if (config.encrypted_db_key) {
      const password = options.password || await readPassword('请输入主密码: ');

      // 验证密码
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);

      try {
        KeyManager.decryptDatabaseKey(config.encrypted_db_key, masterKey);

        // 密码正确，使用联合验证
        const verifier = new JointVerifier();
        const result = await verifier.verify(
          fingerprintValues,
          identity,
          password
        );

        console.log(chalk.cyan('\\n🔐 联合验证结果:'));
        console.log(`  验证方式: ${result.method}`);
        console.log(`  置信度: ${result.confidence}`);
        console.log(`  验证状态: ${result.success ? chalk.green('✓ 通过') : chalk.red('✗ 失败')}`);

        if (result.success) {
          console.log(chalk.green('\\n✅ 身份验证成功！\\n'));
          console.log(chalk.gray('已证明你是此身份的合法拥有者。'));
        } else {
          console.log(chalk.red('\\n❌ 身份验证失败\\n'));
          console.log(chalk.gray('指纹和密码都不匹配，无法证明身份。'));
        }
      } catch {
        console.log(chalk.red('\\n❌ 密码错误\\n'));
      }
    } else {
      console.log(chalk.yellow('提示: 未设置主密码，请先运行: corivo setup-password\\n'));
    }
  } else {
    console.log(chalk.green('\\n✅ 指纹验证通过！\\n'));
    console.log(chalk.gray('已通过指纹识别证明身份。'));
  }
}
