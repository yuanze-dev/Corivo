/**
 * CLI 命令 - status
 *
 * 显示 Corivo 状态信息
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { KeyManager } from '../../crypto/keys.js';
import { ConfigError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';
import { ContextPusher } from '../../push/context.js';
export async function statusCommand(options = {}) {
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
    // 检查守护进程状态
    const pidPath = path.join(configDir, 'heartbeat.pid');
    let heartbeatRunning = false;
    try {
        if (await fs.stat(pidPath)) {
            const pid = parseInt(await fs.readFile(pidPath, 'utf-8'));
            // 检查进程是否存在
            process.kill(pid, 0);
            heartbeatRunning = true;
        }
    }
    catch { }
    // 解密数据库密钥（可选密码）
    let dbKey;
    const skipPassword = options.noPassword || process.env.CORIVO_NO_PASSWORD === '1';
    if (skipPassword) {
        // 无密码模式：使用 config 中的 db_key（如果有）
        if (config.db_key) {
            dbKey = Buffer.from(config.db_key, 'base64');
        }
        else if (config.encrypted_db_key) {
            throw new ConfigError('数据库已加密，请输入密码或移除 --no-password 选项');
        }
        else {
            dbKey = KeyManager.generateDatabaseKey();
            config.db_key = dbKey.toString('base64');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        }
    }
    else {
        const password = await readPassword('请输入主密码: ', { allowEmpty: !process.stdin.isTTY });
        if (password === '') {
            if (config.db_key) {
                dbKey = Buffer.from(config.db_key, 'base64');
            }
            else if (config.encrypted_db_key) {
                throw new ConfigError('数据库已加密，请输入密码');
            }
            else {
                dbKey = KeyManager.generateDatabaseKey();
                config.db_key = dbKey.toString('base64');
                await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            }
        }
        else {
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
    // 获取统计信息
    const stats = db.getStats();
    const health = db.checkHealth();
    // 显示状态
    console.log('');
    console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
    console.log(chalk.cyan('                      Corivo 状态'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));
    // 记忆统计
    console.log(chalk.cyan('📊 记忆统计'));
    console.log(chalk.gray('  总数:   ') + chalk.white(stats.total.toString()));
    console.log(chalk.gray('  活跃:   ') + chalk.green((stats.byStatus.active || 0).toString()));
    console.log(chalk.gray('  冷却:   ') + chalk.yellow((stats.byStatus.cooling || 0).toString()));
    console.log(chalk.gray('  冷冻:   ') + chalk.hex('#FF9500')((stats.byStatus.cold || 0).toString()));
    console.log(chalk.gray('  归档:   ') + chalk.gray((stats.byStatus.archived || 0).toString()));
    // 标注分布
    const annotations = Object.entries(stats.byAnnotation);
    if (annotations.length > 0) {
        console.log(chalk.cyan('\n🏷️  标注分布'));
        for (const [annotation, count] of annotations) {
            console.log(chalk.gray(`  ${annotation}: `) + chalk.white(count.toString()));
        }
    }
    // 数据库状态
    console.log(chalk.cyan('\n💾 数据库'));
    console.log(chalk.gray('  路径:   ') + chalk.white(dbPath));
    console.log(chalk.gray('  状态:   ') +
        (health.ok ? chalk.green('✅ 正常') : chalk.red('❌ 异常')));
    if (health.size) {
        console.log(chalk.gray('  大小:   ') + chalk.white(`${(health.size / 1024 / 1024).toFixed(2)} MB`));
    }
    // 心跳守护进程
    console.log(chalk.cyan('\n⚡ 心跳守护进程'));
    console.log(chalk.gray('  状态:   ') +
        (heartbeatRunning ? chalk.green('🟢 运行中') : chalk.gray('⚪ 未启动')));
    // 附加上下文推送
    const pusher = new ContextPusher(db);
    const needsAttention = await pusher.pushNeedsAttention();
    if (needsAttention) {
        console.log(needsAttention);
    }
    // 下一步提示
    console.log(chalk.cyan('\n🚀 下一步：'));
    console.log(chalk.gray('  corivo save --content "..." --annotation "..."'));
    console.log(chalk.gray('  corivo save --pending --content "..."'));
    console.log(chalk.gray('  corivo query "..."'));
    console.log(chalk.gray('  corivo start | stop'));
    console.log('');
}
//# sourceMappingURL=status.js.map