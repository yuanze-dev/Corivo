/**
 * CLI command - status
 *
 * TUI mode is handled by renderTui() in src/tui/index.ts,
 * dynamically imported via the --tui flag in index.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { loadSolverConfig } from '@/config';
import { ContextPusher } from '@/application/push/context.js';
import { getServiceManager } from '@/infrastructure/platform/index.js';
import { getConfigDir, getDefaultDatabasePath } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { openCorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import { ConfigError } from '@/domain/errors/index.js';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';
import type { CliOutput } from '@/cli/runtime';
import { getCliOutput } from '@/cli/runtime';

type StatusCommandOptions = {
  json?: boolean;
};

export const statusCommand = async (options: StatusCommandOptions) => {
  if (options.json) {
    await jsonStatus();
    return;
  }
  const { renderTui } = await import('@/cli/tui/index.js');
  await renderTui();
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getSupermemoryConfigured(config: any): boolean {
  const supermemory = config?.memoryEngine?.supermemory;
  if (!supermemory || typeof supermemory !== 'object') {
    return false;
  }
  // Match resolver semantics by forcing provider resolution.
  try {
    const provider = resolveMemoryProvider({
      ...(typeof config === 'object' && config !== null ? config : {}),
      memoryEngine: { provider: 'supermemory', supermemory },
    } as any);
    return provider.provider === 'supermemory';
  } catch {
    return false;
  }
}

const jsonStatus = async (output: CliOutput = getCliOutput()) => {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config: any;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content) as any;
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  if (config.encrypted_db_key) {
    throw new ConfigError(
      'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init',
    );
  }

  const dbPath = getDefaultDatabasePath();

  const activeProviderRaw = config?.memoryEngine?.provider;
  const activeProvider = isNonEmptyString(activeProviderRaw) ? activeProviderRaw : 'local';
  const isRemoteOnly = activeProvider === 'supermemory';

  const [serviceStatus, solverConfig] = await Promise.all([
    getServiceManager().getStatus(),
    loadSolverConfig(configDir),
  ]);

  let attentionMessage: string | null = null;
  let memoryStats:
    | { total: number; byStatus: unknown; byAnnotation: unknown }
    | { total: null; byStatus: Record<string, never>; byAnnotation: Record<string, never> };
  let databaseInfo:
    | {
        path: string;
        healthy: boolean;
        integrity: unknown;
        sizeBytes: number;
        blockCount: number;
        encryption: unknown;
      }
    | {
        path: string;
        healthy: null;
        integrity: null;
        sizeBytes: 0;
        blockCount: null;
        encryption: null;
      };

  if (isRemoteOnly) {
    memoryStats = { total: null, byStatus: {}, byAnnotation: {} };
    databaseInfo = {
      path: dbPath,
      healthy: null,
      integrity: null,
      sizeBytes: 0,
      blockCount: null,
      encryption: null,
    };
  } else {
    const db = openCorivoDatabase({
      path: dbPath,
      enableEncryption: false,
    });

    const stats = db.getStats();
    const health = db.checkHealth();
    const encryption = db.getEncryptionInfo();
    attentionMessage = await new ContextPusher(db).pushNeedsAttention();

    memoryStats = {
      total: stats.total,
      byStatus: stats.byStatus,
      byAnnotation: stats.byAnnotation,
    };
    databaseInfo = {
      path: dbPath,
      healthy: health.ok,
      integrity: health.integrity,
      sizeBytes: health.size ?? 0,
      blockCount: health.blockCount ?? stats.total,
      encryption,
    };
  }

  const supermemoryConfigured = getSupermemoryConfigured(config);

  let providerHealthcheck: { ok: boolean; provider: string; message?: string };
  try {
    const provider = resolveMemoryProvider(config);
    providerHealthcheck = await provider.healthcheck();
  } catch (error) {
    providerHealthcheck = {
      ok: false,
      provider: activeProvider,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  output.info(
    JSON.stringify(
      {
        memory: memoryStats,
        database: databaseInfo,
        daemon: serviceStatus,
        sync: solverConfig
          ? {
              configured: true,
              serverUrl: solverConfig.server_url,
              lastPushVersion: solverConfig.last_push_version,
              lastPullVersion: solverConfig.last_pull_version,
            }
          : {
              configured: false,
            },
        memoryEngine: {
          activeProvider,
          supermemory: {
            configured: supermemoryConfigured,
          },
          providerHealthcheck,
        },
        attention: {
          message: attentionMessage,
        },
        nextSteps: [
          'corivo save --content "..." --annotation "..."',
          'corivo save --pending --content "..."',
          'corivo query "..."',
          'corivo start | stop',
        ],
      },
      null,
      2,
    ),
  );
};

export const statusCliCommand = new Command('status')
  .description('View status')
  .option('--json', 'Output JSON formate')
  .action(statusCommand);
