/**
 * CLI command - sync
 *
 * Synchronizes memory data with the Corivo solver server.
 */

import { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import {
  createCliLogger,
  createCliOutput,
  createConfiguredCliLogger,
  getCliDatabase,
  getCliDatabasePath,
  getCliIdentityPath,
  loadCliConfig,
  loadCliSolver,
  readCliJson,
  saveCliSolver,
  writeCliJson,
} from '@/cli/runtime';
import type { Logger as SyncLogger } from '../../utils/logging.js';
import {
  applyPulledChangesets,
  authenticate,
  post,
  type PulledChangeset,
} from '../../runtime/sync-client.js';

interface RegisterResponse {
  shared_secret: string;
}

function buildDeviceName(): string {
  const platformNames: Record<string, string> = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const name = platformNames[process.platform] || process.platform;
  return `${name} (${os.hostname()})`;
}

/**
 * Register with the solver server and return SolverConfig; if failed, return null
 */
export async function registerWithSolver(
  serverUrl: string,
  identityId: string,
  logger: SyncLogger
): Promise<import('../../config.js').SolverConfig | null> {
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
    const bootstrapLogger = createCliLogger();
    const bootstrapOutput = createCliOutput(bootstrapLogger);

    // --pair: generate pairing code
    if (options.pair) {
      const config = await loadCliConfig();
      if (!config) {
        bootstrapOutput.error('Corivo is not initialized, please run corivo init');
        process.exit(1);
      }
      const logger = createConfiguredCliLogger(config);
      const output = createCliOutput(logger);
      const solverConfig = await loadCliSolver();
      if (!solverConfig) {
        output.error('Not connected to a sync server, please run corivo sync --register');
        process.exit(1);
      }
      const pairServerUrl = command.getOptionValueSource('server') === 'cli'
        ? options.server
        : solverConfig.server_url;
      let token: string;
      try {
        token = await authenticate(pairServerUrl, config.identity_id, solverConfig.shared_secret, logger);
      } catch (err: unknown) {
        output.error('Authentication failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      const result = await post(`${pairServerUrl}/auth/pair`, {}, logger, token, 'pair') as { pairing_code: string; expires_at: number };
      const expiresIn = Math.round((result.expires_at - Date.now()) / 60000);
      output.info(`\nPairing code: ${result.pairing_code}  (valid for ${expiresIn} minutes)\n`);
      output.info('Run this on the new device:');
      output.info(`  corivo init --join ${result.pairing_code} --server ${pairServerUrl}\n`);
      return;
    }

    const config = await loadCliConfig();
    if (!config) {
      bootstrapOutput.error('Corivo is not initialized, please run corivo init');
      process.exit(1);
    }
    const logger = createConfiguredCliLogger(config);
    const output = createCliOutput(logger);

    let solverConfig = await loadCliSolver();

    // If there is no solver.json or registration is explicitly required
    if (!solverConfig || options.register) {
      const serverUrl: string = options.server;
      const siteId = randomBytes(16).toString('hex');
      const deviceId = randomBytes(8).toString('hex');

      output.info(`Registering with ${serverUrl}...`);
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
          output.error('This identity is already registered. Use the existing solver.json or add --register to force reconfiguration');
        } else {
          output.error('Registration failed:', errMsg);
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
        await saveCliSolver(solverConfig);
      } catch (err: unknown) {
        output.error('Failed to save solver.json:', err instanceof Error ? err.message : String(err));
        // Continue execution without terminating the process
      }
      output.success(`Registration successful! site_id: ${siteId}`);
      output.info('solver.json saved to ~/.corivo/solver.json');
    }

    const { server_url, shared_secret, site_id } = solverConfig;
    logger.debug(`[sync:cli] starting sync server=${server_url} site=${site_id} lastPull=${solverConfig.last_pull_version} lastPush=${solverConfig.last_push_version}`);

    // Certification
    output.info('Authenticating...');
    let token: string;
    try {
      token = await authenticate(server_url, config.identity_id, shared_secret, logger);
    } catch (err: unknown) {
      output.error('Authentication failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    output.success('Authentication successful');

    const db = getCliDatabase({
      path: getCliDatabasePath(),
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
          await saveCliSolver(solverConfig!);
          logger.debug(`[sync:cli] updated last_push_version=${solverConfig!.last_push_version}`);
        } catch (err: any) {
          output.error('Failed to save solver.json:', err.message);
          // Continue execution without terminating the process
        }
      }
    } catch (err: unknown) {
      output.error('Push failed:', err instanceof Error ? err.message : String(err));
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
          await saveCliSolver(solverConfig!);
          logger.debug(`[sync:cli] updated last_pull_version=${solverConfig!.last_pull_version}`);
        } catch (err: any) {
          output.error('Failed to save solver.json:', err.message);
        }
      }
    } catch (err: unknown) {
      output.error('Pull failed:', err instanceof Error ? err.message : String(err));
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

      const identityPath = getCliIdentityPath();
      try {
        const identity = await readCliJson<{
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
        await writeCliJson(identityPath, identity);
      } catch { /* ignore if identity.json does not exist */ }
    } catch { /* failure to fetch devices does not affect the main flow */ }

    logger.debug(`[sync:cli] sync finished push=${pushStored} pull=${pullCount}`);
    output.info(`Sync complete - Push: ${pushStored}, Pull: ${pullCount}`);
  });

  return cmd;
}
