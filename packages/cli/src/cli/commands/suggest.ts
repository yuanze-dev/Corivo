/**
 * Suggest 命令
 *
 * 基于长期记忆生成上下文建议
 * 供 hooks 内部调用，用户不直接使用
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { getConfigDir, getDefaultDatabasePath } from '../../storage/database.js';
import { CorivoDatabase } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { SuggestionEngine, SuggestionContext } from '../../engine/suggestion.js';

export const suggestCommand = new Command('suggest');

suggestCommand
  .description('生成上下文建议（内部命令，供 hooks 调用）')
  .option('-c, --context <type>', '上下文类型: session-start | post-request', 'session-start')
  .option('-m, --last-message <text>', 'Claude 最后的回复内容')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action(async (options) => {
    try {
      const configDir = getConfigDir();
      const configPath = path.join(configDir, 'config.json');
      const dbPath = getDefaultDatabasePath();

      // 读取配置
      let config;
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        console.log('');
        return;
      }

      // 获取数据库密钥（无密码模式）
      let dbKey: Buffer;
      const skipPassword = options.password === false || process.env.CORIVO_NO_PASSWORD === '1';

      if (skipPassword) {
        if (config.db_key) {
          dbKey = Buffer.from(config.db_key, 'base64');
        } else if (config.encrypted_db_key) {
          console.log('');
          return;
        } else {
          dbKey = KeyManager.generateDatabaseKey();
          config.db_key = dbKey.toString('base64');
          await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        }
      } else {
        // 有密码模式暂不支持（suggest 需要快速响应）
        console.log('');
        return;
      }

      // 打开数据库
      const db = CorivoDatabase.getInstance({
        path: dbPath,
        key: dbKey,
        enableEncryption: config.encrypted_db_key !== undefined,
      });

      // 解析上下文类型
      const contextMap: Record<string, SuggestionContext> = {
        'session-start': SuggestionContext.SESSION_START,
        'post-request': SuggestionContext.POST_REQUEST,
      };

      const context = contextMap[options.context] ?? SuggestionContext.SESSION_START;

      // 生成建议
      const engine = new SuggestionEngine(db);
      const suggestion = engine.generate(context, options.lastMessage);

      if (suggestion) {
        console.log(suggestion);
      }
      // 空输出 = 无建议
    } catch (error) {
      // 调试时显示错误
      // console.error('suggest error:', error);
      console.log('');
    }
  });

export default suggestCommand;
