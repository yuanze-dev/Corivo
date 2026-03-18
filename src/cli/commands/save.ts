/**
 * CLI 命令 - save
 *
 * 保存信息到 Corivo
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database';
import { KeyManager } from '../../crypto/keys';
import { ConfigError, ValidationError } from '../../errors';
import { validateAnnotation } from '../../models';

interface SaveOptions {
  content?: string;
  annotation?: string;
  source?: string;
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

  if (!options.annotation) {
    throw new ValidationError('缺少 --annotation 参数');
  }

  if (!validateAnnotation(options.annotation)) {
    throw new ValidationError(
      '标注格式无效。格式应为 "性质 · 领域 · 标签"，例如: "决策 · project · corivo"'
    );
  }

  // 解密数据库密钥
  const password = await readPassword('请输入主密码: ');
  const salt = Buffer.from(config.salt, 'base64');
  const masterKey = KeyManager.deriveMasterKey(password, salt);
  const encryptedDbKey = config.encrypted_db_key;
  const dbKey = KeyManager.decryptDatabaseKey(encryptedDbKey, masterKey);

  // 打开数据库
  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

  // 创建 Block
  const block = db.createBlock({
    content: options.content,
    annotation: options.annotation,
    source: options.source || 'cli',
  });

  console.log(`✅ 已保存 (ID: ${block.id})`);
}

export async function readPassword(prompt: string): Promise<string> {
  const readline = require('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (password: string) => {
      rl.close();
      resolve(password);
    });
  });
}
