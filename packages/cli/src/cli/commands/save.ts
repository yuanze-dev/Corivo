/**
 * CLI 命令 - save
 *
 * 保存信息到 Corivo
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError, ValidationError } from '../../errors/index.js';
import { validateAnnotation } from '../../models/index.js';
import { readPassword } from '../utils/password.js';
import { ConflictDetector } from '../../engine/conflict-detector.js';

interface SaveOptions {
  content?: string;
  annotation?: string;
  source?: string;
  pending?: boolean;
  noPassword?: boolean;
}

export async function saveCommand(options: SaveOptions): Promise<void> {
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

  // 验证输入
  if (!options.content) {
    throw new ValidationError('缺少 --content 参数');
  }

  // 如果没有标注且不是 pending 模式，提示用户
  const annotation = options.annotation || (options.pending ? 'pending' : '');

  if (!options.pending && !annotation) {
    console.log(chalk.yellow('\n⚠️  未提供标注，将以 pending 模式保存'));
    console.log(chalk.gray('心跳守护进程稍后会尝试自动标注\n'));
  }

  // 只有非 pending 模式才验证标注格式
  if (annotation && annotation !== 'pending' && !validateAnnotation(annotation)) {
    throw new ValidationError(
      '标注格式无效。格式应为 "性质 · 领域 · 标签"，例如: "决策 · project · corivo"'
    );
  }

  // 解密数据库密钥（可选密码）
  let dbKey: Buffer;
  const skipPassword = options.noPassword || process.env.CORIVO_NO_PASSWORD === '1';

  if (skipPassword) {
    // 无密码模式：使用 config 中的 db_key（如果有）
    if (config.db_key) {
      dbKey = Buffer.from(config.db_key, 'base64');
    } else if (config.encrypted_db_key) {
      // 有加密密钥但跳过密码：提示用户
      throw new ConfigError('数据库已加密，请输入密码或移除 --no-password 选项');
    } else {
      // 旧版本兼容：生成并保存新密钥
      dbKey = KeyManager.generateDatabaseKey();
      config.db_key = dbKey.toString('base64');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } else {
    const password = await readPassword('请输入主密码: ', { allowEmpty: !process.stdin.isTTY });
    if (password === '') {
      // 空密码：尝试使用 config 中的 db_key
      if (config.db_key) {
        dbKey = Buffer.from(config.db_key, 'base64');
      } else if (config.encrypted_db_key) {
        throw new ConfigError('数据库已加密，请输入密码');
      } else {
        dbKey = KeyManager.generateDatabaseKey();
        config.db_key = dbKey.toString('base64');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      }
    } else {
      // 使用密码解密
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const encryptedDbKey = config.encrypted_db_key;
      if (!encryptedDbKey) {
        throw new ConfigError('未设置密码，请先运行: corivo setup-password');
      }
      dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);
    }
  }

  // 打开数据库
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey, enableEncryption: config.encrypted_db_key !== undefined });

  // 创建 Block
  const block = db.createBlock({
    content: options.content,
    annotation: annotation || 'pending',
    source: options.source || 'cli',
  });

  // 检测矛盾（像朋友一样提醒）
  const conflictDetector = new ConflictDetector();
  const existingBlocks = db.queryBlocks({ limit: 50 });
  const conflictReminder = conflictDetector.detect(options.content, existingBlocks);

  // 显示结果
  console.log(chalk.green(`\n✅ 记忆已保存\n`));
  console.log(chalk.gray('ID:       ') + chalk.white(block.id));
  console.log(chalk.gray('内容:     ') + chalk.white(block.content));
  console.log(chalk.gray('标注:     ') + chalk.cyan(block.annotation));
  console.log(chalk.gray('生命力:   ') + chalk.yellow('100 (活跃)'));
  console.log();

  // 如果有矛盾，友好提醒
  if (conflictReminder && conflictReminder.hasConflict) {
    console.log(chalk.yellow(conflictReminder.message));
    console.log();
  }
}
