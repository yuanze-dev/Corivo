/**
 * CLI 命令 - sync
 *
 * 与 Corivo solver 服务器同步记忆数据
 */

import { Command } from 'commander';
import { createHmac, randomBytes } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, loadSolverConfig, saveSolverConfig, getDatabaseKey } from '../../config.js';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../../storage/database.js';

interface RegisterResponse {
  shared_secret: string;
}

function buildDeviceName(): string {
  const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const name = platformNames[process.platform] || process.platform;
  return `${name} (${os.hostname()})`;
}

// 简单 fetch wrapper（Node.js 18+ 内置 fetch）
export async function post(url: string, body: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function get(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function authenticate(serverUrl: string, identityId: string, sharedSecret: string): Promise<string> {
  const { challenge } = await post(`${serverUrl}/auth/challenge`, { identity_id: identityId }) as { challenge: string };
  const response = createHmac('sha256', sharedSecret).update(challenge).digest('hex');
  const { token } = await post(`${serverUrl}/auth/verify`, {
    identity_id: identityId,
    challenge,
    response,
  }) as { token: string };
  return token;
}

/**
 * 向 solver 服务器注册，返回 SolverConfig；失败返回 null
 */
export async function registerWithSolver(
  serverUrl: string,
  identityId: string
): Promise<import('../../config.js').SolverConfig | null> {
  const { randomBytes } = await import('node:crypto');
  const siteId = randomBytes(16).toString('hex');
  const deviceId = randomBytes(8).toString('hex');

  try {
    const result = await post(`${serverUrl}/auth/register`, {
      identity_id: identityId,
      fingerprints: [],
      device_id: deviceId,
      device_name: buildDeviceName(),
      platform: process.platform,
      arch: process.arch,
      site_id: siteId,
    }) as RegisterResponse;

    return {
      server_url: serverUrl,
      shared_secret: result.shared_secret,
      site_id: siteId,
      last_push_version: 0,
      last_pull_version: 0,
    };
  } catch {
    return null;
  }
}

export function createSyncCommand(): Command {
  const cmd = new Command('sync');
  cmd.description('与 Corivo solver 服务器同步记忆数据');
  cmd.option('--server <url>', 'Solver 服务器地址', 'http://localhost:3141');
  cmd.option('--register', '注册到 solver 服务器');
  cmd.option('--pair', '生成配对码，供新设备加入');

  cmd.action(async (options) => {
    // --pair：生成配对码
    if (options.pair) {
      const config = await loadConfig();
      if (!config) {
        console.error('Corivo 未初始化，请先运行 corivo init');
        process.exit(1);
      }
      const solverConfig = await loadSolverConfig();
      if (!solverConfig) {
        console.error('未连接同步服务器，请先运行 corivo sync --register');
        process.exit(1);
      }
      let token: string;
      try {
        token = await authenticate(solverConfig.server_url, config.identity_id, solverConfig.shared_secret);
      } catch (err: unknown) {
        console.error('认证失败:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      const result = await post(`${solverConfig.server_url}/auth/pair`, {}, token) as { pairing_code: string; expires_at: number };
      const expiresIn = Math.round((result.expires_at - Date.now()) / 60000);
      console.log(`\n配对码: ${result.pairing_code}  (${expiresIn} 分钟内有效)\n`);
      console.log('在新设备上运行:');
      console.log(`  corivo init --join ${result.pairing_code} --server ${solverConfig.server_url}\n`);
      return;
    }

    const config = await loadConfig();
    if (!config) {
      console.error('Corivo 未初始化，请先运行 corivo init');
      process.exit(1);
    }

    let solverConfig = await loadSolverConfig();

    // 如果没有 solver.json 或明确要求注册
    if (!solverConfig || options.register) {
      const serverUrl: string = options.server;
      const siteId = randomBytes(16).toString('hex');
      const deviceId = randomBytes(8).toString('hex');

      console.log(`正在向 ${serverUrl} 注册...`);
      let result: RegisterResponse;
      try {
        result = await post(`${serverUrl}/auth/register`, {
          identity_id: config.identity_id,
          fingerprints: [],
          device_id: deviceId,
          device_name: buildDeviceName(),
          platform: process.platform,
          arch: process.arch,
          site_id: siteId,
        }) as RegisterResponse;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('409')) {
          console.error('该 identity 已注册，请使用已有的 solver.json 或添加 --register 强制重新配置');
        } else {
          console.error('注册失败:', errMsg);
        }
        process.exit(1);
      }

      solverConfig = {
        server_url: serverUrl,
        shared_secret: result.shared_secret,
        site_id: siteId,
        last_push_version: 0,
        last_pull_version: 0,
      };

      try {
        await saveSolverConfig(solverConfig);
      } catch (err: unknown) {
        console.error('保存 solver.json 失败:', err instanceof Error ? err.message : String(err));
        // 继续执行，不终止进程
      }
      console.log(`注册成功！site_id: ${siteId}`);
      console.log('solver.json 已保存到 ~/.corivo/solver.json');
    }

    const { server_url, shared_secret, site_id } = solverConfig;

    // 认证
    console.log('正在认证...');
    let token: string;
    try {
      token = await authenticate(server_url, config.identity_id, shared_secret);
    } catch (err: unknown) {
      console.error('认证失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    console.log('认证成功');

    // 获取本地数据库
    const dbKey = await getDatabaseKey();
    if (!dbKey) {
      console.error('无法获取数据库密钥');
      process.exit(1);
    }

    const db = CorivoDatabase.getInstance({
      path: getDefaultDatabasePath(),
      key: dbKey,
    });

    // Push：获取本地变更
    // 注意：cr-sqlite 扩展可能未加载，此时 crsql_changes 表不存在
    // 我们做简化版 push：发送所有 blocks（全量），仅用于初始同步
    // 完整的 cr-sqlite 集成需要单独启用
    let pushStored = 0;
    try {
      const blocks = db.queryBlocks({ limit: 10000 });
      if (blocks.length > 0) {
        const changesets = blocks.map((b, i) => ({
          table_name: 'blocks',
          pk: b.id,
          col_name: 'content',
          col_version: 1,
          db_version: i + 1,   // 从 0 开始的序号，而非从 last_push_version 起算
          value: b.content,
          site_id: site_id,
        }));

        const pushResult = await post(
          `${server_url}/sync/push`,
          { site_id, db_version: changesets.length, changesets },
          token
        ) as { stored: number };
        pushStored = pushResult.stored;

        solverConfig!.last_push_version = blocks.length;  // 记录已推送总量，不再累加
        try {
          await saveSolverConfig(solverConfig!);
        } catch (err: any) {
          console.error('保存 solver.json 失败:', err.message);
          // 继续执行，不终止进程
        }
      }
    } catch (err: unknown) {
      console.error('Push 失败:', err instanceof Error ? err.message : String(err));
    }

    // Pull：拉取远端变更
    let pullCount = 0;
    try {
      const pullResult = await post(
        `${server_url}/sync/pull`,
        { site_id, since_version: solverConfig.last_pull_version },
        token
      ) as { changesets: unknown[]; current_version: number };

      pullCount = pullResult.changesets.length;

      // 无论是否有数据，都更新版本（避免重复拉取）
      if (pullResult.current_version > solverConfig!.last_pull_version) {
        solverConfig!.last_pull_version = pullResult.current_version;
        try {
          await saveSolverConfig(solverConfig!);
        } catch (err: any) {
          console.error('保存 solver.json 失败:', err.message);
        }
      }
    } catch (err: unknown) {
      console.error('Pull 失败:', err instanceof Error ? err.message : String(err));
    }

    // 拉取服务端设备列表，更新本地 identity.json
    try {
      const devicesResult = await (async () => {
        const res = await fetch(`${server_url}/auth/devices`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ devices: Array<{ deviceId: string; deviceName: string | null; platform: string | null; arch: string | null; createdAt: number; lastSeenAt: number }> }>;
      })();

      const configDir = getConfigDir();
      const identityPath = path.join(configDir, 'identity.json');
      try {
        const raw = await fs.readFile(identityPath, 'utf-8');
        const identity = JSON.parse(raw);
        identity.devices = {};
        for (const d of devicesResult.devices) {
          identity.devices[d.deviceId] = {
            id: d.deviceId,
            name: d.deviceName ?? d.deviceId,
            platform: d.platform ?? 'unknown',
            arch: d.arch ?? 'unknown',
            first_seen: new Date(d.createdAt).toISOString(),
            last_seen: new Date(d.lastSeenAt).toISOString(),
          };
        }
        identity.updated_at = new Date().toISOString();
        await fs.writeFile(identityPath, JSON.stringify(identity, null, 2));
      } catch { /* identity.json 不存在则忽略 */ }
    } catch { /* 拉取 devices 失败不影响主流程 */ }

    console.log(`同步完成 — Push: ${pushStored} 条, Pull: ${pullCount} 条`);
  });

  return cmd;
}
