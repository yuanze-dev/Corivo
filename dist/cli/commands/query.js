/**
 * CLI 命令 - query
 *
 * 查询 Corivo 中的信息
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database';
import { KeyManager } from '../../crypto/keys';
import { ConfigError } from '../../errors';
import { ContextPusher } from '../../push/context';
import { readPassword } from './save';
export async function queryCommand(query, options) {
    // 读取配置
    const configDir = getConfigDir();
    const configPath = path.join(configDir, 'config.json');
    let config;
    try {
        const content = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
    }
    catch {
        throw new ConfigError('Corivo 未初始化。请先运行: corivo init');
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
    // 搜索
    const limit = options.limit ? parseInt(options.limit) : 10;
    const results = db.searchBlocks(query, limit);
    if (results.length === 0) {
        console.log(`未找到与 "${query}" 相关的记忆`);
        return;
    }
    // 显示结果
    console.log(`找到 ${results.length} 条相关记忆:\n`);
    for (const block of results) {
        console.log(`${block.id}: ${block.content.slice(0, 100)}`);
        console.log(`  标注: ${block.annotation} | 生命力: ${block.vitality} | 状态: ${block.status}`);
        console.log(`  更新: ${new Date(block.updated_at * 1000).toLocaleString('zh-CN')}\n`);
    }
    // 附加上下文推送
    const pusher = new ContextPusher(db);
    const context = await pusher.pushContext(query, 5);
    if (context) {
        console.log(context);
    }
}
//# sourceMappingURL=query.js.map