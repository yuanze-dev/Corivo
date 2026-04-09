import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ConfigError } from '@/domain/errors/index.js';
import {
  createCliLogger,
  createCliOutput,
  createConfiguredCliLogger,
  getCliDatabase,
  getCliDatabasePath,
  getCliHeartbeatPidPath,
  getCliNow,
  loadCliConfig,
  removeCliFile,
  writeCliText,
} from '@/cli/runtime';
import { createHostCommand } from '@/cli/commands/host';
import { createDaemonCommand } from '@/cli/commands/daemon';
import { createQueryCommand } from '@/cli/commands/query';
import { createSaveCommand } from '@/cli/commands/save';
import { createSupermemoryCommand } from '@/cli/commands/supermemory';
import { hostImportCommand } from '@/cli/commands/host-import';
import { isInteractiveTTY, readConfirmIfTTY } from '@/cli/utils/password';
import { createHostInstallUseCase } from '@/application/hosts/install-host';
import { createHostDoctorUseCase } from '@/application/hosts/doctor-host';
import { createHostUninstallUseCase } from '@/application/hosts/uninstall-host';
import { runPromptQueryCommand, runSearchQueryCommand } from '@/application/bootstrap/query-execution';
import { getAllHostAdapters } from '@/infrastructure/hosts';
import { createSaveMemoryUseCase } from '@/application/memory/save-memory';
import type {
  CliApp,
  DaemonCommandCapabilities,
  HostCommandCapabilities,
  QueryCommandCapabilities,
} from './types.js';

const LEGACY_CONFIG_ERROR =
  'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init';

export function createCliApp(): CliApp {
  const logger = createCliLogger();
  const output = createCliOutput(logger);

  const hostCapabilities: HostCommandCapabilities = {
    listHosts: () => getAllHostAdapters(),
    installHost: async (input) => {
      const config = await loadCliConfig();
      const installLogger = config ? createConfiguredCliLogger(config) : logger;
      const installHost = createHostInstallUseCase({
        logger: installLogger,
        isInteractive: isInteractiveTTY,
        confirmImport: (prompt) => readConfirmIfTTY(prompt, true),
      });
      return installHost(input);
    },
    doctorHost: async (input) => {
      const doctorHost = createHostDoctorUseCase();
      return doctorHost(input);
    },
    uninstallHost: async (input) => {
      const uninstallHost = createHostUninstallUseCase();
      return uninstallHost(input);
    },
    writeInfo: (text) => output.info(text),
    writeError: (text) => output.error(text),
    writeSuccess: (text) => output.success(text),
    logger,
    hostImportCommand,
  };

  const daemonCapabilities: DaemonCommandCapabilities = {
    runDaemon: async () => {
      const pidPath = getCliHeartbeatPidPath();
      await writeCliText(pidPath, String(process.pid));

      const heartbeatPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../@/runtime/daemon/heartbeat.js',
      );

      logger.log('[corivo] Starting heartbeat background worker...');

      const child = spawn(process.execPath, [heartbeatPath], {
        env: process.env,
        stdio: 'inherit',
      });

      const cleanup = (signal: NodeJS.Signals) => {
        child.kill(signal);
      };
      process.once('SIGTERM', () => cleanup('SIGTERM'));
      process.once('SIGINT', () => cleanup('SIGINT'));

      child.once('exit', async (code) => {
        await removeCliFile(pidPath).catch(() => {});
        process.exit(code ?? 1);
      });

      child.once('error', async (error) => {
        logger.error('[corivo] Failed to start heartbeat child process:', error);
        await removeCliFile(pidPath).catch(() => {});
        process.exit(1);
      });
    },
    logger,
  };

  const queryCapabilities: QueryCommandCapabilities = {
    runPromptQuery: (options) => runPromptQueryCommand(options),
    runSearchQuery: (input) =>
      runSearchQueryCommand(input, {
        loadDb: async () => {
          const config = await loadCliConfig();
          if (!config) {
            throw new ConfigError('Corivo is not initialized. Please run: corivo init');
          }
          if ((config as { encrypted_db_key?: unknown }).encrypted_db_key) {
            throw new ConfigError(LEGACY_CONFIG_ERROR);
          }
          // Remote engine: avoid creating/opening the local SQLite DB just to execute provider-backed search.
          // In supermemory mode, query execution should work without a local DB instance.
          if ((config as any)?.memoryEngine?.provider === 'supermemory') {
            return null;
          }
          return getCliDatabase({
            path: getCliDatabasePath(),
            enableEncryption: false,
          });
        },
        writeOutput: (text) => output.info(text),
        logger,
        now: () => getCliNow(),
      }),
    writeOutput: (text) => output.info(text),
    logger,
  };

  return {
    commands: {
      host: createHostCommand(hostCapabilities),
      daemon: createDaemonCommand(daemonCapabilities),
      query: createQueryCommand(queryCapabilities),
      save: createSaveCommand({
        saveMemory: createSaveMemoryUseCase(),
        output,
        logger,
      }),
      supermemory: createSupermemoryCommand({
        writeInfo: (text) => output.info(text),
        writeError: (text) => output.error(text),
        writeSuccess: (text) => output.success(text),
        logger,
      }),
    },
    capabilities: {
      logger,
    },
  };
}
