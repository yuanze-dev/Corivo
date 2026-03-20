/**
 * CLI 命令 - init
 *
 * 初始化 Corivo，基于平台指纹创建身份
 *
 * v0.10+ 更新：
 * - 基于平台指纹的用户身份识别（无需密码）
 * - 跨设备身份关联
 * - 数据库密钥明文存储（依赖文件系统权限）
 * - init 后自动启动心跳守护进程
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { KeyManager } from '../../crypto/keys.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { FileSystemError } from '../../errors/index.js';
import { initializeIdentity, } from '../../identity/index.js';
import { saveConfig } from '../../config.js';
import { startCommand } from './start.js';
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
    console.log('           Corivo — 一个为你而活着的数字伙伴');
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
    // ========== 身份识别 (v0.10 新增) ==========
    console.log('正在识别您的身份...\n');
    const identityResult = await initializeIdentity(configDir);
    if (identityResult.isNew) {
        console.log('✓ 创建新身份');
        console.log(`  身份 ID: ${identityResult.identity.identity_id}`);
    }
    else {
        console.log('✓ 识别到现有身份');
        console.log(`  身份 ID: ${identityResult.identity.identity_id}`);
    }
    // 显示检测到的平台指纹
    if (identityResult.fingerprints.length > 0) {
        console.log('\n检测到的平台：');
        for (const fp of identityResult.fingerprints) {
            const platformNames = {
                claude_code: 'Claude Code',
                feishu: '飞书',
                device: '设备',
            };
            const confidenceIcons = {
                high: '🟢',
                medium: '🟡',
                low: '⚪',
            };
            console.log(`  ${confidenceIcons[fp.confidence]} ${platformNames[fp.platform] || fp.platform}: ${fp.value.substring(0, 8)}...`);
        }
    }
    console.log('');
    // ========== 身份识别结束 ==========
    // 生成密钥（无需密码）
    console.log('正在生成密钥...');
    const dbKey = KeyManager.generateDatabaseKey();
    // 将密钥转换为 base64 存储（明文）
    const dbKeyBase64 = dbKey.toString('base64');
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
    const config = {
        version: '0.11.0',
        created_at: new Date().toISOString(),
        identity_id: identityResult.identity.identity_id,
        db_key: dbKeyBase64,
    };
    const saveResult = await saveConfig(config, configDir);
    if (!saveResult.success) {
        console.log('❌ 配置保存失败: ' + saveResult.error);
        exit(1);
    }
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                  ✅ 初始化完成！');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎯 Corivo 已准备就绪');
    console.log('   身份 ID: ' + identityResult.identity.identity_id);
    console.log('   数据库:   ' + dbPath);
    console.log('\n💡 提示：');
    console.log('   数据库密钥明文存储在本地，依赖文件系统权限保护');
    console.log('   请确保你的用户目录安全（不与他人共享）\n');
    // ========== 自动启动心跳 ==========
    console.log('🫀 正在启动心跳...');
    try {
        // 启动心跳（无需用户交互）
        await startCommand();
        console.log('\n✨ Corivo 已苏醒！心跳将持续跳动，自动整理你的记忆。');
    }
    catch (error) {
        console.log('\n⚠️  心跳启动失败，你可以稍后手动启动：');
        console.log('  corivo start\n');
    }
    // 下一步提示
    console.log('下一步：');
    console.log('  corivo save --content "..." --annotation "性质 · 领域 · 标签"');
    console.log('  corivo query "..."');
    console.log('  corivo status');
    console.log('  corivo stop    # 停止心跳（如需要）\n');
    exit(0);
}
//# sourceMappingURL=init.js.map