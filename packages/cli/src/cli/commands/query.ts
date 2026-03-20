/**
 * CLI 命令 - query
 *
 * 查询 Corivo 中的信息
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError } from '../../errors/index.js';
import { ContextPusher } from '../../push/context.js';
import { QueryHistoryTracker } from '../../engine/query-history.js';
import { readPassword } from '../utils/password.js';

interface QueryOptions {
  limit?: string;
  verbose?: boolean;
  pattern?: boolean;
  noPassword?: boolean;
}

export async function queryCommand(query: string, options: QueryOptions): Promise<void> {
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

  // 解密数据库密钥（可选密码）
  let dbKey: Buffer;
  const skipPassword = options.noPassword || process.env.CORIVO_NO_PASSWORD === '1';

  if (skipPassword) {
    // 无密码模式：使用 config 中的 db_key（如果有）
    if (config.db_key) {
      dbKey = Buffer.from(config.db_key, 'base64');
    } else if (config.encrypted_db_key) {
      throw new ConfigError('数据库已加密，请输入密码或移除 --no-password 选项');
    } else {
      dbKey = KeyManager.generateDatabaseKey();
      config.db_key = dbKey.toString('base64');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
  } else {
    const password = await readPassword('请输入主密码: ', { allowEmpty: !process.stdin.isTTY });
    if (password === '') {
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

  // 搜索
  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  if (options.limit && isNaN(limit)) {
    throw new Error('--limit 参数必须是有效数字');
  }
  const results = db.searchBlocks(query, limit);

  if (results.length === 0) {
    console.log(chalk.yellow(`\n未找到与 "${query}" 相关的记忆`));
    return;
  }

  // 显示结果
  console.log(chalk.cyan(`\n找到 ${results.length} 条相关记忆:\n`));

  for (const block of results) {
    // ID 和内容
    console.log(chalk.gray(block.id) + ' ' + chalk.white(block.content));

    // 元信息
    const annotation = block.annotation || 'pending';
    const statusColor = getStatusColor(block.status);
    const statusText = statusColor(block.status);

    console.log(
      chalk.gray(`  标注: ${annotation} | 生命力: ${block.vitality} | 状态: ${statusText}`)
    );

    // 详细信息
    if (options.verbose) {
      console.log(chalk.gray(`  访问次数: ${block.access_count}`));
      if (block.last_accessed) {
        const lastAccess = new Date(block.last_accessed);
        const daysAgo = Math.floor((Date.now() - block.last_accessed) / 86400000);
        console.log(chalk.gray(`  最后访问: ${lastAccess.toLocaleString('zh-CN')} (${daysAgo}天前)`));
      }
      if (block.pattern) {
        console.log(chalk.gray(`  模式: ${block.pattern.type} - ${block.pattern.decision}`));
      }
    }

    console.log();
  }

  // 附加上下文推送
  const pusher = new ContextPusher(db);
  const queryTracker = new QueryHistoryTracker(db);

  // 记录本次查询
  queryTracker.recordQuery(query, results);

  // 检查是否有相似的历史查询
  const similarReminder = queryTracker.findSimilarQueries(query);
  if (similarReminder.hasSimilar) {
    console.log(chalk.gray(similarReminder.message));
  }

  // 决策模式推送
  if (options.pattern) {
    const patternContext = await pusher.pushPatterns(query, 3);
    if (patternContext) {
      console.log(patternContext);
    }
  }

  // 相关记忆推送
  const context = await pusher.pushContext(query, 5, {
    showAnnotation: true,
    showVitality: true,
    showTime: options.verbose,
  });

  if (context) {
    console.log(context);
  }
}

/**
 * 获取状态对应的颜色函数
 */
function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'active':
      return chalk.green;
    case 'cooling':
      return chalk.yellow;
    case 'cold':
      return chalk.hex('#FF9500'); // Orange
    case 'archived':
      return chalk.gray;
    default:
      return chalk.gray;
  }
}
