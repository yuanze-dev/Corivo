/**
 * CLI command - sync
 *
 * Synchronizes memory data with the Corivo solver server.
 */

import { Command } from 'commander';
import { createHmac, randomBytes } from 'node:crypto';
import os from 'node:os';
import type { CorivoDatabase } from '@/storage/database';
import { createCliContext } from '../context/create-context.js';
import { createConfiguredCliContext } from '../context/configured-context.js';
import type { Logger as SyncLogger } from '../../utils/logging.js';

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

function buildDeviceName(): string {
  const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const name = platformNames[process.platform] || process.platform;
  return `${name} (${os.hostname()})`;
}

// Simple fetch wrapper (Node.js 18+ built-in fetch)
export async function post(
  url: string,
  body: unknown,
  logger: SyncLogger,
  token?: string,
  label = 'request'
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  logger.debug(`[sync:${label}] request url=${url} token=${token ? 'present' : 'absent'} body=${truncate(stringifyPayload(body))}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error(`[sync:${label}] request failed status=${res.status} body=${truncate(text)}`);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  logger.debug(`[sync:${label}] response status=${res.status} body=${truncate(text)}`);
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
  logger: SyncLogger
): Promise<string> {
  const { challenge } = await post(
    `${serverUrl}/auth/challenge`,
    { identity_id: identityId },
    logger,
    undefined,
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
    logger,
    undefined,
    'auth-verify'
  ) as { token: string };
  return token;
}

export function applyPulledChangesets(
  db: CorivoDatabase,
  changesets: PulledChangeset[],
  logger: SyncLogger
): number {
  let applied = 0;
  logger.debug(`[sync:pull] received ${changesets.length} pull changesets preview=${summarizeChangesets(changesets)}`);

  for (const cs of changesets) {
    // The current simplified synchronization protocol only synchronizes blocks.content.
    if (cs.table_name !== 'blocks' || cs.col_name !== 'content' || !cs.pk || cs.value == null) {
      logger.debug(
        `[sync:pull] skipped changeset block=${cs.pk || '(empty)'} table=${cs.table_name} col=${cs.col_name ?? 'null'} dbVersion=${cs.db_version ?? 'n/a'}`
      );
      continue;
    }

    logger.debug(
      `[sync:pull] preparing to write block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} contentLength=${cs.value.length}`
    );
    try {
      db.upsertBlock({
        id: cs.pk,
        content: cs.value,
      });
    } catch (error) {
      logger.error(
        `[sync:pull] failed to write block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} error=${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
    applied++;
    logger.debug(`[sync:pull] wrote block successfully block=${cs.pk} applied=${applied}`);
  }

  logger.debug(`[sync:pull] apply complete applied=${applied}/${changesets.length}`);
  return applied;
}

/**
 * Register with the solver server and return SolverConfig; if failed, return null
 */
export async function registerWithSolver(
  serverUrl: string,
  identityId: string,
  logger: SyncLogger
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
    }, logger) as RegisterResponse;

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
  cmd.description('Sync memory data with the Corivo solver server');
  cmd.option('--server <url>', 'Solver server URL', 'http://localhost:3141');
  cmd.option('--register', 'Register with the solver server');
  cmd.option('--pair', 'Generate a pairing code for a new device');

  cmd.action(async (options, command: Command) => {
    const bootstrapContext = createCliContext();

    // --pair: generate pairing code
    if (options.pair) {
      const config = await bootstrapContext.config.load();
      if (!config) {
        console.error('Corivo is not initialized, please run corivo init');
        process.exit(1);
      }
      const context = createConfiguredCliContext(config);
      const { logger } = context;
      const solverConfig = await context.config.loadSolver();
      if (!solverConfig) {
        console.error('Not connected to a sync server, please run corivo sync --register');
        process.exit(1);
      }
      const pairServerUrl = command.getOptionValueSource('server') === 'cli'
        ? options.server
        : solverConfig.server_url;
      let token: string;
      try {
        token = await authenticate(pairServerUrl, config.identity_id, solverConfig.shared_secret, logger);
      } catch (err: unknown) {
        console.error('Authentication failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      const result = await post(`${pairServerUrl}/auth/pair`, {}, logger, token, 'pair') as { pairing_code: string; expires_at: number };
      const expiresIn = Math.round((result.expires_at - Date.now()) / 60000);
      console.log(`\nPairing code: ${result.pairing_code}  (valid for ${expiresIn} minutes)\n`);
      console.log('Run this on the new device:');
      console.log(`  corivo init --join ${result.pairing_code} --server ${pairServerUrl}\n`);
      return;
    }

    const config = await bootstrapContext.config.load();
    if (!config) {
      console.error('Corivo is not initialized, please run corivo init');
      process.exit(1);
    }
    const context = createConfiguredCliContext(config);
    const { logger } = context;

    let solverConfig = await context.config.loadSolver();

    // If there is no solver.json or registration is explicitly required
    if (!solverConfig || options.register) {
      const serverUrl: string = options.server;
      const siteId = randomBytes(16).toString('hex');
      const deviceId = randomBytes(8).toString('hex');

      console.log(`Registering with ${serverUrl}...`);
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
        }, logger) as RegisterResponse;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('409')) {
          console.error('This identity is already registered. Use the existing solver.json or add --register to force reconfiguration');
        } else {
          console.error('Registration failed:', errMsg);
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
        await context.config.saveSolver(solverConfig);
      } catch (err: unknown) {
        console.error('Failed to save solver.json:', err instanceof Error ? err.message : String(err));
        // Continue execution without terminating the process
      }
      console.log(`Registration successful! site_id: ${siteId}`);
      console.log('solver.json saved to ~/.corivo/solver.json');
    }

    const { server_url, shared_secret, site_id } = solverConfig;
    logger.debug(`[sync:cli] starting sync server=${server_url} site=${site_id} lastPull=${solverConfig.last_pull_version} lastPush=${solverConfig.last_push_version}`);

    // Certification
    console.log('Authenticating...');
    let token: string;
    try {
      token = await authenticate(server_url, config.identity_id, shared_secret, logger);
    } catch (err: unknown) {
      console.error('Authentication failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    console.log('Authentication successful');

    const db = context.db.get({
      path: context.paths.databasePath(),
    });

    // Push: Get local changes
    // NOTE: The cr-sqlite extension may not be loaded and the crsql_changes table does not exist at this time
    // We do a simplified version of push: send all blocks (full amount), only for initial synchronization
    // Full cr-sqlite integration needs to be enabled separately
    let pushStored = 0;
    try {
      const blocks = db.queryBlocks({ limit: 10000 });
      logger.debug(`[sync:cli] preparing push blocks=${blocks.length}`);
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
          logger,
          token,
          'push'
        ) as { stored: number };
        pushStored = pushResult.stored;
        logger.debug(`[sync:cli] push complete stored=${pushStored} changesets=${changesets.length}`);

        solverConfig!.last_push_version = blocks.length;  // Record the total amount pushed and no longer add it up
        try {
          await context.config.saveSolver(solverConfig!);
          logger.debug(`[sync:cli] updated last_push_version=${solverConfig!.last_push_version}`);
        } catch (err: any) {
          console.error('Failed to save solver.json:', err.message);
          // Continue execution without terminating the process
        }
      }
    } catch (err: unknown) {
      console.error('Push failed:', err instanceof Error ? err.message : String(err));
    }

    // Pull: Pull remote changes
    let pullCount = 0;
    try {
      const pullResult = await post(
        `${server_url}/sync/pull`,
        { site_id, since_version: solverConfig.last_pull_version },
        logger,
        token,
        'pull'
      ) as { changesets: PulledChangeset[]; current_version: number };
      logger.debug(
        `[sync:cli] pull complete changesets=${pullResult.changesets.length} currentVersion=${pullResult.current_version} sinceVersion=${solverConfig.last_pull_version}`
      );

      pullCount = applyPulledChangesets(db, pullResult.changesets, logger);
      logger.debug(`[sync:cli] pull written to database applied=${pullCount}`);

      // Update the version regardless of whether there is data (to avoid repeated pulls)
      if (pullResult.current_version > solverConfig!.last_pull_version) {
        solverConfig!.last_pull_version = pullResult.current_version;
        try {
          await context.config.saveSolver(solverConfig!);
          logger.debug(`[sync:cli] updated last_pull_version=${solverConfig!.last_pull_version}`);
        } catch (err: any) {
          console.error('Failed to save solver.json:', err.message);
        }
      }
    } catch (err: unknown) {
      console.error('Pull failed:', err instanceof Error ? err.message : String(err));
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
      logger.debug(`[sync:cli] fetched device list successfully devices=${devicesResult.devices.length}`);

      const identityPath = context.paths.identityPath();
      try {
        const identity = await context.fs.readJson<{
          devices?: Record<string, {
            id: string;
            name: string;
            platform: string;
            arch: string;
            first_seen: string;
            last_seen: string;
          }>;
          updated_at?: string;
          [key: string]: unknown;
        }>(identityPath);
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
        await context.fs.writeJson(identityPath, identity);
      } catch { /* ignore if identity.json does not exist */ }
    } catch { /* failure to fetch devices does not affect the main flow */ }

    logger.debug(`[sync:cli] sync finished push=${pushStored} pull=${pullCount}`);
    console.log(`Sync complete - Push: ${pushStored}, Pull: ${pullCount}`);
  });

  return cmd;
}
