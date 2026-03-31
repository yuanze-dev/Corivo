/**
 * CLI command - sync
 *
 * Synchronizes memory data with the Corivo solver server.
 */

import { Command } from 'commander';
import { createHmac, randomBytes } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, loadSolverConfig, saveSolverConfig, getDatabaseKey } from '@/config';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '@/storage/database';
import { createLogger } from '@/utils/logging';
import type { Logger as SyncLogger, LogTarget } from '@/utils/logging';

interface RegisterResponse {
  shared_secret: string;
}

export interface PulledChangeset {
  table_name: string;
  pk: string;
  col_name: string | null;
  col_version?: number;
  db_version?: number;
  value: string | null;
  site_id?: string;
}

function stringifyPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...<trimmed ${text.length - maxLength} chars>`;
}

function summarizeChangesets(changesets: PulledChangeset[]): string {
  if (changesets.length === 0) return '[]';
  return truncate(
    stringifyPayload(
      changesets.slice(0, 3).map((changeset) => ({
        table_name: changeset.table_name,
        pk: changeset.pk,
        col_name: changeset.col_name,
        db_version: changeset.db_version,
        site_id: changeset.site_id,
        value_length: changeset.value?.length ?? 0,
      }))
    )
  );
}

export function createSyncLogger(logLevel?: string, target?: LogTarget): SyncLogger {
  return createLogger(target, logLevel);
}

function buildDeviceName(): string {
  const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const name = platformNames[process.platform] || process.platform;
  return `${name} (${os.hostname()})`;
}

// Simple fetch wrapper (Node.js 18+ built-in fetch)
export async function post(
  url: string,
  body: unknown,
  token?: string,
  logger: SyncLogger = createSyncLogger(),
  label = 'request'
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  logger.debug(`[sync:${label}] 请求 url=${url} token=${token ? 'present' : 'absent'} body=${truncate(stringifyPayload(body))}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error(`[sync:${label}] 请求失败 status=${res.status} body=${truncate(text)}`);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  logger.debug(`[sync:${label}] 响应 status=${res.status} body=${truncate(text)}`);
  return text.length === 0 ? null : JSON.parse(text);
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

export async function authenticate(
  serverUrl: string,
  identityId: string,
  sharedSecret: string,
  logger: SyncLogger = createSyncLogger()
): Promise<string> {
  const { challenge } = await post(
    `${serverUrl}/auth/challenge`,
    { identity_id: identityId },
    undefined,
    logger,
    'auth-challenge'
  ) as { challenge: string };
  const response = createHmac('sha256', sharedSecret).update(challenge).digest('hex');
  const { token } = await post(
    `${serverUrl}/auth/verify`,
    {
      identity_id: identityId,
      challenge,
      response,
    },
    undefined,
    logger,
    'auth-verify'
  ) as { token: string };
  return token;
}

export function applyPulledChangesets(
  db: CorivoDatabase,
  changesets: PulledChangeset[],
  logger: SyncLogger = createSyncLogger()
): number {
  let applied = 0;
  logger.debug(`[sync:pull] 收到 ${changesets.length} 条 pull changesets preview=${summarizeChangesets(changesets)}`);

  for (const cs of changesets) {
    // The current simplified synchronization protocol only synchronizes blocks.content.
    if (cs.table_name !== 'blocks' || cs.col_name !== 'content' || !cs.pk || cs.value == null) {
      logger.debug(
        `[sync:pull] 已跳过 changeset block=${cs.pk || '(empty)'} table=${cs.table_name} col=${cs.col_name ?? 'null'} dbVersion=${cs.db_version ?? 'n/a'}`
      );
      continue;
    }

    logger.debug(
      `[sync:pull] 准备写入 block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} contentLength=${cs.value.length}`
    );
    try {
      db.upsertBlock({
        id: cs.pk,
        content: cs.value,
      });
    } catch (error) {
      logger.error(
        `[sync:pull] 写入 block 失败 block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} error=${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
    applied++;
    logger.debug(`[sync:pull] 写入 block 成功 block=${cs.pk} applied=${applied}`);
  }

  logger.debug(`[sync:pull] 应用完成 applied=${applied}/${changesets.length}`);
  return applied;
}

/**
 * Register with the solver server and return SolverConfig; if failed, return null
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

  cmd.action(async (options, command: Command) => {
    // --pair: generate pairing code
    if (options.pair) {
      const config = await loadConfig();
      if (!config) {
        console.error('Corivo 未初始化，请先运行 corivo init');
        process.exit(1);
      }
      const logger = createSyncLogger(config.settings?.logLevel);
      const solverConfig = await loadSolverConfig();
      if (!solverConfig) {
        console.error('未连接同步服务器，请先运行 corivo sync --register');
        process.exit(1);
      }
      const pairServerUrl = command.getOptionValueSource('server') === 'cli'
        ? options.server
        : solverConfig.server_url;
      let token: string;
      try {
        token = await authenticate(pairServerUrl, config.identity_id, solverConfig.shared_secret, logger);
      } catch (err: unknown) {
        console.error('认证失败:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      const result = await post(`${pairServerUrl}/auth/pair`, {}, token, logger, 'pair') as { pairing_code: string; expires_at: number };
      const expiresIn = Math.round((result.expires_at - Date.now()) / 60000);
      console.log(`\n配对码: ${result.pairing_code}  (${expiresIn} 分钟内有效)\n`);
      console.log('在新设备上运行:');
      console.log(`  corivo init --join ${result.pairing_code} --server ${pairServerUrl}\n`);
      return;
    }

    const config = await loadConfig();
    if (!config) {
      console.error('Corivo 未初始化，请先运行 corivo init');
      process.exit(1);
    }
    const logger = createSyncLogger(config.settings?.logLevel);

    let solverConfig = await loadSolverConfig();

    // If there is no solver.json or registration is explicitly required
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
        // Continue execution without terminating the process
      }
      console.log(`注册成功！site_id: ${siteId}`);
      console.log('solver.json 已保存到 ~/.corivo/solver.json');
    }

    const { server_url, shared_secret, site_id } = solverConfig;
    logger.debug(`[sync:cli] 开始同步 server=${server_url} site=${site_id} lastPull=${solverConfig.last_pull_version} lastPush=${solverConfig.last_push_version}`);

    // Certification
    console.log('正在认证...');
    let token: string;
    try {
      token = await authenticate(server_url, config.identity_id, shared_secret, logger);
    } catch (err: unknown) {
      console.error('认证失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    console.log('认证成功');

    // Get local database
    const dbKey = await getDatabaseKey();
    if (!dbKey) {
      console.error('无法获取数据库密钥');
      process.exit(1);
    }

    const db = CorivoDatabase.getInstance({
      path: getDefaultDatabasePath(),
      key: dbKey,
    });

    // Push: Get local changes
    // NOTE: The cr-sqlite extension may not be loaded and the crsql_changes table does not exist at this time
    // We do a simplified version of push: send all blocks (full amount), only for initial synchronization
    // Full cr-sqlite integration needs to be enabled separately
    let pushStored = 0;
    try {
      const blocks = db.queryBlocks({ limit: 10000 });
      logger.debug(`[sync:cli] 准备 push blocks=${blocks.length}`);
      if (blocks.length > 0) {
        const changesets = blocks.map((b, i) => ({
          table_name: 'blocks',
          pk: b.id,
          col_name: 'content',
          col_version: 1,
          db_version: i + 1,   // Sequence number starting from 0 instead of last_push_version
          value: b.content,
          site_id: site_id,
        }));

        const pushResult = await post(
          `${server_url}/sync/push`,
          { site_id, db_version: changesets.length, changesets },
          token,
          logger,
          'push'
        ) as { stored: number };
        pushStored = pushResult.stored;
        logger.debug(`[sync:cli] push 完成 stored=${pushStored} changesets=${changesets.length}`);

        solverConfig!.last_push_version = blocks.length;  // Record the total amount pushed and no longer add it up
        try {
          await saveSolverConfig(solverConfig!);
          logger.debug(`[sync:cli] 已更新 last_push_version=${solverConfig!.last_push_version}`);
        } catch (err: any) {
          console.error('保存 solver.json 失败:', err.message);
          // Continue execution without terminating the process
        }
      }
    } catch (err: unknown) {
      console.error('Push 失败:', err instanceof Error ? err.message : String(err));
    }

    // Pull: Pull remote changes
    let pullCount = 0;
    try {
      const pullResult = await post(
        `${server_url}/sync/pull`,
        { site_id, since_version: solverConfig.last_pull_version },
        token,
        logger,
        'pull'
      ) as { changesets: PulledChangeset[]; current_version: number };
      logger.debug(
        `[sync:cli] pull 完成 changesets=${pullResult.changesets.length} currentVersion=${pullResult.current_version} sinceVersion=${solverConfig.last_pull_version}`
      );

      pullCount = applyPulledChangesets(db, pullResult.changesets, logger);
      logger.debug(`[sync:cli] pull 已写库 applied=${pullCount}`);

      // Update the version regardless of whether there is data (to avoid repeated pulls)
      if (pullResult.current_version > solverConfig!.last_pull_version) {
        solverConfig!.last_pull_version = pullResult.current_version;
        try {
          await saveSolverConfig(solverConfig!);
          logger.debug(`[sync:cli] 已更新 last_pull_version=${solverConfig!.last_pull_version}`);
        } catch (err: any) {
          console.error('保存 solver.json 失败:', err.message);
        }
      }
    } catch (err: unknown) {
      console.error('Pull 失败:', err instanceof Error ? err.message : String(err));
    }

    // Pull the server device list and update the local identity.json
    try {
      const devicesResult = await (async () => {
        const res = await fetch(`${server_url}/auth/devices`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ devices: Array<{ deviceId: string; deviceName: string | null; platform: string | null; arch: string | null; createdAt: number; lastSeenAt: number }> }>;
      })();
      logger.debug(`[sync:cli] 拉取设备列表成功 devices=${devicesResult.devices.length}`);

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

    logger.debug(`[sync:cli] 同步结束 push=${pushStored} pull=${pullCount}`);
    console.log(`同步完成 — Push: ${pushStored} 条, Pull: ${pullCount} 条`);
  });

  return cmd;
}
