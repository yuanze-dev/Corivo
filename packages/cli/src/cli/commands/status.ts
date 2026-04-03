/**
 * CLI command - status
 *
 * TUI mode is handled by renderTui() in src/tui/index.ts,
 * dynamically imported via the --tui flag in index.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSolverConfig } from '@/config';
import { ContextPusher } from '@/push/context.js';
import { getServiceManager } from '@/infrastructure/platform/index.js';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { ConfigError } from '@/errors';
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
  const { renderTui } = await import('@/tui/index.js');
  await renderTui();
};

const jsonStatus = async (output: CliOutput = getCliOutput()) => {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.json');

  let config: { encrypted_db_key?: unknown };
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content) as { encrypted_db_key?: unknown };
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  if (config.encrypted_db_key) {
    throw new ConfigError(
      'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init',
    );
  }

  const dbPath = getDefaultDatabasePath();
  const db = CorivoDatabase.getInstance({
    path: dbPath,
    enableEncryption: false,
  });

  const [serviceStatus, solverConfig, attentionMessage] = await Promise.all([
    getServiceManager().getStatus(),
    loadSolverConfig(configDir),
    new ContextPusher(db).pushNeedsAttention(),
  ]);

  const stats = db.getStats();
  const health = db.checkHealth();
  const encryption = db.getEncryptionInfo();

  output.info(
    JSON.stringify(
      {
        memory: {
          total: stats.total,
          byStatus: stats.byStatus,
          byAnnotation: stats.byAnnotation,
        },
        database: {
          path: dbPath,
          healthy: health.ok,
          integrity: health.integrity,
          sizeBytes: health.size ?? 0,
          blockCount: health.blockCount ?? stats.total,
          encryption,
        },
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
