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
export async function saveCommand(options) {
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
    if (annotation && !validateAnnotation(annotation)) {
        throw new ValidationError('标注格式无效。格式应为 "性质 · 领域 · 标签"，例如: "决策 · project · corivo"');
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
        annotation: annotation || 'pending',
        source: options.source || 'cli',
    });
    // 显示结果
    console.log(chalk.green(`\n✅ 记忆已保存\n`));
    console.log(chalk.gray('ID:       ') + chalk.white(block.id));
    console.log(chalk.gray('内容:     ') + chalk.white(block.content));
    console.log(chalk.gray('标注:     ') + chalk.cyan(block.annotation));
    console.log(chalk.gray('生命力:   ') + chalk.yellow('100 (活跃)'));
    console.log();
}
//# sourceMappingURL=save.js.map