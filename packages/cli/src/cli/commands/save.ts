/**
 * CLI command - save
 *
 * Saves information to Corivo as a memory block.
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
  // Read configuration
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
  }

  // Validate input
  if (!options.content) {
    throw new ValidationError('缺少 --content 参数');
  }

  // If there is no label and it is not in pending mode, prompt the user
  const annotation = options.annotation || (options.pending ? 'pending' : '');

  if (!options.pending && !annotation) {
    console.log(chalk.yellow('\n⚠️  未提供标注，将以 pending 模式保存'));
    console.log(chalk.gray('心跳守护进程稍后会尝试自动标注\n'));
  }

  // Only non-pending mode will verify the annotation format.
  if (annotation && annotation !== 'pending' && !validateAnnotation(annotation)) {
    throw new ValidationError(
      '标注格式无效。格式应为 "性质 · 领域 · 标签"，例如: "决策 · project · corivo"'
    );
  }

  // Decrypt database key (optional password)
  let dbKey: Buffer;
  const skipPassword = options.password === false || process.env.CORIVO_NO_PASSWORD === '1';

  if (skipPassword) {
    // Passwordless mode: use db_key from config if available
    if (config.db_key) {
      dbKey = Buffer.from(config.db_key, 'base64');
    } else if (config.encrypted_db_key) {
      // Encryption key available but password skipped: prompt user
      throw new ConfigError('数据库已加密，请输入密码或移除 --no-password 选项');
    } else {
      // Old version compatibility: generate and save new keys
      dbKey = KeyManager.generateDatabaseKey();
      config.db_key = dbKey.toString('base64');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } else {
    const password = await readPassword('请输入主密码: ', { allowEmpty: !process.stdin.isTTY });
    if (password === '') {
      // Empty password: try using db_key from config
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
      // Decrypt using password
      const salt = Buffer.from(config.salt, 'base64');
      const masterKey = KeyManager.deriveMasterKey(password, salt);
      const encryptedDbKey = config.encrypted_db_key;
      if (!encryptedDbKey) {
        throw new ConfigError('未设置密码，请先运行: corivo setup-password');
      }
      dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);
    }
  }

  // Open database
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey, enableEncryption: config.encrypted_db_key !== undefined });

  // Create Block
  const block = db.createBlock({
    content: options.content,
    annotation: annotation || 'pending',
    source: options.source || 'cli',
  });

  // Detect inconsistencies (alert like a friend)
  const conflictDetector = new ConflictDetector();
  const existingBlocks = db.queryBlocks({ limit: 50 });
  const conflictReminder = conflictDetector.detect(options.content, existingBlocks);

  // Show results
  console.log(chalk.green(`\n✅ 记忆已保存\n`));
  console.log(chalk.gray('ID:       ') + chalk.white(block.id));
  console.log(chalk.gray('内容:     ') + chalk.white(block.content));
  console.log(chalk.gray('标注:     ') + chalk.cyan(block.annotation));
  console.log(chalk.gray('生命力:   ') + chalk.yellow('100 (活跃)'));
  console.log();

  // If there is any conflict, please give a friendly reminder
  if (conflictReminder && conflictReminder.hasConflict) {
    console.log(chalk.yellow(conflictReminder.message));
    console.log();
  }
}
