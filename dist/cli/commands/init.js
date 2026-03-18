/**
 * CLI 命令 - init
 *
 * 初始化 Corivo，设置密码并创建数据库
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { KeyManager } from '../../crypto/keys.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { FileSystemError } from '../../errors/index.js';
import { readPassword } from '../utils/password.js';
/**
 * 退出并清理
 */
function exit(code = 0) {
    process.exit(code);
}
/**
 * 初始化命令
 */
export async function initCommand() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('           欢迎使用 Corivo — 你的赛博伙伴');
    console.log('═══════════════════════════════════════════════════════\n');
    // 检查是否已初始化
    const dbPath = getDefaultDatabasePath();
    try {
        if (fsSync.existsSync(dbPath)) {
            console.log(`⚠️  检测到 Corivo 已存在于: ${dbPath}`);
            console.log('如果需要重新初始化，请先删除现有数据库：');
            console.log(`  rm ${dbPath}`);
            exit(1);
        }
    }
    catch { }
    // 创建配置目录
    const configDir = getConfigDir();
    try {
        await fs.mkdir(configDir, { recursive: true });
    }
    catch (error) {
        throw new FileSystemError(`无法创建配置目录: ${configDir}`, { cause: error });
    }
    // 输入密码
    console.log('请设置主密码（用于加密数据库）\n');
    console.log('⚠️  密码要求：至少 8 位，包含字母和数字\n');
    const password1 = await readPassword('输入密码: ');
    if (!password1) {
        console.log('❌ 密码不能为空');
        exit(1);
    }
    if (!KeyManager.validatePasswordStrength(password1)) {
        console.log('❌ 密码强度不足：至少 8 位，包含字母和数字');
        exit(1);
    }
    const password2 = await readPassword('确认密码: ');
    if (password1 !== password2) {
        console.log('❌ 两次输入的密码不一致');
        exit(1);
    }
    // 生成密钥
    console.log('\n正在生成密钥...');
    const salt = KeyManager.generateSalt();
    const masterKey = KeyManager.deriveMasterKey(password1, salt);
    const dbKey = KeyManager.generateDatabaseKey();
    const encryptedDbKey = KeyManager.encryptDatabaseKey(dbKey, masterKey);
    const recoveryKey = KeyManager.generateRecoveryKey(masterKey);
    // 创建数据库
    console.log('正在创建加密数据库...');
    const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    // 验证数据库
    const health = db.checkHealth();
    if (!health.ok) {
        console.log('❌ 数据库创建失败');
        exit(1);
    }
    // 保存配置
    const configPath = path.join(configDir, 'config.json');
    const config = {
        version: '0.10.0-mvp',
        created_at: new Date().toISOString(),
        salt: salt.toString('base64'),
        encrypted_db_key: encryptedDbKey,
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    // 显示恢复密钥
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('           ⚠️  重要：请妥善保管恢复密钥 ⚠️');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('您的恢复密钥（24 个单词，BIP39 标准，请手抄保存）：\n');
    const recoveryWords = recoveryKey.split(' ');
    console.log(`  ${recoveryWords.slice(0, 6).join('  ')}`);
    console.log(`  ${recoveryWords.slice(6, 12).join('  ')}`);
    console.log(`  ${recoveryWords.slice(12, 18).join('  ')}`);
    console.log(`  ${recoveryWords.slice(18, 24).join('  ')}`);
    console.log('\n⚠️  重要提示：');
    console.log('  1. 请将这 24 个单词手抄在纸上，存放在安全的地方');
    console.log('  2. 不要拍照、截图或存储在任何联网设备上');
    console.log('  3. 任何人获得此密钥都可以访问您的 Corivo 数据');
    console.log('  4. Corivo 团队也无法帮您恢复此密钥\n');
    await readPassword('\n按回车键确认已手抄恢复密钥...');
    console.log('\n初始化完成！\n');
    // 下一步提示
    console.log('下一步：');
    console.log('  corivo save --content "..." --annotation "性质 · 领域 · 标签"');
    console.log('  corivo query "..."');
    console.log('  corivo status');
    exit(0);
}
//# sourceMappingURL=init.js.map