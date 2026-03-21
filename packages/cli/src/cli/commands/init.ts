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
import path from 'node:path';
import { KeyManager } from '../../crypto/keys.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';
import { FileSystemError } from '../../errors/index.js';
import {
  initializeIdentity,
  initializeIdentityWithId,
  getIdentityId,
  type Fingerprint,
} from '../../identity/index.js';
import { saveConfig, saveSolverConfig, loadConfig, type CorivoConfig, type SolverConfig } from '../../config.js';
import os from 'node:os';
import { startCommand } from './start.js';
import { registerWithSolver, post } from './sync.js';
import { readConfirm } from '../utils/password.js';

/**
 * 退出并清理
 */
function exit(code = 0): never {
  process.exit(code);
}

/**
 * 初始化命令
 */
export async function initCommand(options: { join?: string; server?: string } = {}): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('           Corivo — 一个为你而活着的数字伙伴');
  console.log('═══════════════════════════════════════════════════════\n');

  // 检查是否已初始化（--join 场景允许已存在，会提示用户确认合并）
  const dbPath = getDefaultDatabasePath();
  if (!options.join) {
    try {
      if (fsSync.existsSync(dbPath)) {
        console.log(`⚠️  检测到 Corivo 已存在于: ${dbPath}`);
        console.log('如果需要重新初始化，请先删除现有数据库：');
        console.log(`  rm ${dbPath}`);
        exit(1);
      }
    } catch {}
  }

  // 创建配置目录
  const configDir = getConfigDir();
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    throw new FileSystemError(`无法创建配置目录: ${configDir}`, { cause: error });
  }

  // ========== 身份识别 ==========
  let identityId: string;

  if (options.join) {
    // --join 流程：通过配对码加入已有 identity
    const serverUrl = options.server || process.env.CORIVO_SOLVER_URL || 'http://localhost:3141';
    console.log(`正在通过配对码加入 identity...\n`);

    const deviceId = (await import('node:crypto')).randomBytes(8).toString('hex');
    const siteId = (await import('node:crypto')).randomBytes(16).toString('hex');

    let redeemResult: { identity_id: string; shared_secret: string };
    try {
      const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
      const deviceDisplayName = `${platformNames[process.platform] || process.platform} (${os.hostname()})`;
      redeemResult = await post(`${serverUrl}/auth/redeem-pair`, {
        pairing_code: options.join,
        device_id: deviceId,
        device_name: deviceDisplayName,
        platform: process.platform,
        arch: process.arch,
        site_id: siteId,
      }) as { identity_id: string; shared_secret: string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) {
        console.error('❌ 配对码无效或已过期，请在 Device A 重新运行 corivo sync --pair');
      } else if (msg.includes('409')) {
        console.error('❌ 该设备已注册');
      } else {
        console.error('❌ 配对失败:', msg);
      }
      exit(1);
    }

    identityId = redeemResult.identity_id;
    console.log('✓ 配对成功');
    console.log(`  身份 ID: ${identityId}`);

    // 检测本地是否已有 identity（冲突场景）
    const existingConfig = await loadConfig(configDir);
    let dbKey: Buffer;
    let dbKeyBase64: string;

    if (existingConfig && existingConfig.identity_id !== identityId) {
      console.log('\n⚠️  检测到本机已有 Corivo 身份：');
      console.log(`   当前身份 ID: ${existingConfig.identity_id}`);
      console.log(`   将加入身份 ID: ${identityId}`);
      console.log('\n   选择 Yes：保留本机数据，切换到新 identity（本机数据将在下次同步时推送至服务器）');
      console.log('   选择 No：取消操作，保持现状\n');

      const confirmed = await readConfirm('是否继续？');
      if (!confirmed) {
        console.log('已取消。');
        exit(0);
      }

      // 保留现有 db_key（数据库不变，只更新 identity）
      dbKey = Buffer.from(existingConfig.db_key, 'base64');
      dbKeyBase64 = existingConfig.db_key;
    } else {
      // 全新设备，生成新的 db_key
      dbKey = KeyManager.generateDatabaseKey();
      dbKeyBase64 = dbKey.toString('base64');
    }

    // 创建本地 identity（使用指定 ID，覆盖已有）
    const identityPath = path.join(configDir, 'identity.json');
    try { await fs.unlink(identityPath); } catch { /* 不存在则忽略 */ }
    await initializeIdentityWithId(identityId, configDir);

    if (!existingConfig || existingConfig.identity_id !== identityId) {
      console.log('\n正在创建加密数据库...');
      const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
      const health = db.checkHealth();
      if (!health.ok) {
        console.log('❌ 数据库创建失败');
        exit(1);
      }
    }

    const config: CorivoConfig = {
      version: '0.11.0',
      created_at: existingConfig?.created_at ?? new Date().toISOString(),
      identity_id: identityId,
      db_key: dbKeyBase64,
    };
    const saveResult = await saveConfig(config, configDir);
    if (!saveResult.success) {
      console.log('❌ 配置保存失败: ' + saveResult.error);
      exit(1);
    }

    const solverConfig: SolverConfig = {
      server_url: serverUrl,
      shared_secret: redeemResult.shared_secret,
      site_id: siteId,
      last_push_version: 0,
      last_pull_version: 0,
    };
    await saveSolverConfig(solverConfig, configDir);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                  ✅ 加入成功！');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎯 Corivo 已准备就绪');
    console.log('   身份 ID: ' + identityId);
    console.log('   数据库:   ' + dbPath);
    console.log('   同步服务器: ' + serverUrl + '\n');

    // 自动启动心跳
    console.log('🫀 正在启动心跳...');
    try {
      await startCommand();
      console.log('\n✨ Corivo 已苏醒！心跳将自动同步数据。');
    } catch {
      console.log('\n⚠️  心跳启动失败，请手动运行: corivo start');
    }

    console.log('\n下一步：');
    console.log('  corivo sync       # 立即拉取已有数据');
    console.log('  corivo query "..."');
    console.log('  corivo status\n');

    exit(0);
  }

  // 正常初始化流程
  console.log('正在识别您的身份...\n');

  const identityResult = await initializeIdentity(configDir);
  identityId = identityResult.identity.identity_id;

  if (identityResult.isNew) {
    console.log('✓ 创建新身份');
    console.log(`  身份 ID: ${identityId}`);
  } else {
    console.log('✓ 识别到现有身份');
    console.log(`  身份 ID: ${identityId}`);
  }

  // 显示检测到的平台指纹
  if (identityResult.fingerprints.length > 0) {
    console.log('\n检测到的平台：');
    for (const fp of identityResult.fingerprints) {
      const platformNames: Record<string, string> = {
        claude_code: 'Claude Code',
        feishu: '飞书',
        device: '设备',
      };
      const confidenceIcons: Record<string, string> = {
        high: '🟢',
        medium: '🟡',
        low: '⚪',
      };
      console.log(
        `  ${confidenceIcons[fp.confidence]} ${platformNames[fp.platform] || fp.platform}: ${fp.value.substring(0, 8)}...`
      );
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
  const config: CorivoConfig = {
    version: '0.11.0',
    created_at: new Date().toISOString(),
    identity_id: identityId,
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
  console.log('   身份 ID: ' + identityId);
  console.log('   数据库:   ' + dbPath);
  console.log('\n💡 提示：');
  console.log('   数据库密钥明文存储在本地，依赖文件系统权限保护');
  console.log('   请确保你的用户目录安全（不与他人共享）\n');

  // ========== 自动注册 solver ==========
  const defaultSolverUrl = process.env.CORIVO_SOLVER_URL || 'http://localhost:3141';
  try {
    const solverConfig = await registerWithSolver(defaultSolverUrl, identityId);
    if (solverConfig) {
      await saveSolverConfig(solverConfig, configDir);
      console.log('🔗 已连接同步服务器\n');
    }
  } catch {
    // 服务器不可达，静默跳过；daemon 稍后会重试
  }
  // ========== 自动注册 solver 结束 ==========

  // ========== 自动启动心跳 ==========
  console.log('🫀 正在启动心跳...');

  try {
    // 启动心跳（无需用户交互）
    await startCommand();
    console.log('\n✨ Corivo 已苏醒！心跳将持续跳动，自动整理你的记忆。');
  } catch (error) {
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
