/**
 * CLI command - init
 *
 * Initializes Corivo and creates an identity based on platform fingerprints.
 *
 * Changes in v0.10+:
 * - Platform-fingerprint-based user identity (no password required)
 * - Cross-device identity association
 * - Database key stored in plaintext, relying on filesystem permissions for protection
 * - Heartbeat daemon starts automatically after init
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
 * Exit the process with the given code.
 */
function exit(code = 0): never {
  process.exit(code);
}

/**
 * Main init command handler.
 */
export async function initCommand(options: { join?: string; server?: string } = {}): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('           Corivo — 一个为你而活着的数字伙伴');
  console.log('═══════════════════════════════════════════════════════\n');

  // Skip existence check when --join is provided; the user will be prompted to confirm merging identities.
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

  // Ensure the config directory exists before writing any files.
  const configDir = getConfigDir();
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    throw new FileSystemError(`无法创建配置目录: ${configDir}`, { cause: error });
  }

  // ========== Identity resolution ==========
  let identityId: string;

  if (options.join) {
    // --join flow: join an existing identity using a pairing code
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

    // Detect whether a local identity already exists (conflict scenario).
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

      // Reuse the existing db_key so the database stays intact; only the identity is updated.
      dbKey = Buffer.from(existingConfig.db_key, 'base64');
      dbKeyBase64 = existingConfig.db_key;
    } else {
      // Brand-new device: generate a fresh db_key.
      dbKey = KeyManager.generateDatabaseKey();
      dbKeyBase64 = dbKey.toString('base64');
    }

    // Create the local identity with the specified ID, overwriting any existing one.
    const identityPath = path.join(configDir, 'identity.json');
    try { await fs.unlink(identityPath); } catch { /* ignore if file does not exist */ }
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

    // Auto-start the heartbeat after joining.
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

  // Normal (non-join) initialization flow.
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

  // Display the platform fingerprints that were detected.
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
  // ========== End identity resolution ==========

  // Generate a database key without requiring a password.
  console.log('正在生成密钥...');

  const dbKey = KeyManager.generateDatabaseKey();
  // Store the key as base64 in plaintext — security relies on filesystem permissions.
  const dbKeyBase64 = dbKey.toString('base64');

  // Create the encrypted database.
  console.log('正在创建加密数据库...');

  const db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });

  // Verify that the database was created and is healthy.
  const health = db.checkHealth();
  if (!health.ok) {
    console.log('❌ 数据库创建失败');
    exit(1);
  }

  // Persist the config to disk.
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

  // ========== Auto-register with solver ==========
  const defaultSolverUrl = process.env.CORIVO_SOLVER_URL || 'http://localhost:3141';
  try {
    const solverConfig = await registerWithSolver(defaultSolverUrl, identityId);
    if (solverConfig) {
      await saveSolverConfig(solverConfig, configDir);
      console.log('🔗 已连接同步服务器\n');
    }
  } catch {
    // Server unreachable — skip silently; the daemon will retry later.
  }
  // ========== End auto-register with solver ==========

  // ========== Auto-start heartbeat ==========
  console.log('🫀 正在启动心跳...');

  try {
    // Start the heartbeat without requiring user interaction.
    await startCommand();
    console.log('\n✨ Corivo 已苏醒！心跳将持续跳动，自动整理你的记忆。');
  } catch (error) {
    console.log('\n⚠️  心跳启动失败，你可以稍后手动启动：');
    console.log('  corivo start\n');
  }

  // Next-step hints for the user.
  console.log('下一步：');
  console.log('  corivo save --content "..." --annotation "性质 · 领域 · 标签"');
  console.log('  corivo query "..."');
  console.log('  corivo status');
  console.log('  corivo stop    # 停止心跳（如需要）\n');

  exit(0);
}
