import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ConfigError } from '@/errors';
import { createConfiguredCliContext, createCliContext } from '@/cli/context';
import { createMemoryCommand } from '@/cli/commands/memory';
import { createHostCommand } from '@/cli/commands/host';
import { createDaemonCommand } from '@/cli/commands/daemon';
import { createQueryCommand } from '@/cli/commands/query';
import { hostImportCommand } from '@/cli/commands/host-import';
import { isInteractiveTTY, readConfirmIfTTY } from '@/cli/utils/password';
import { runMemoryPipeline } from '@/application/memory/run-memory-pipeline';
import { createHostInstallUseCase } from '@/application/hosts/install-host';
import { createHostDoctorUseCase } from '@/application/hosts/doctor-host';
import { createHostUninstallUseCase } from '@/application/hosts/uninstall-host';
import { runPromptQueryCommand, runSearchQueryCommand } from '@/application/bootstrap/query-execution';
import { getAllHostAdapters } from '@/infrastructure/hosts';
import type {
  CliApp,
  DaemonCommandCapabilities,
  HostCommandCapabilities,
  MemoryCommandCapabilities,
  QueryCommandCapabilities,
} from './types.js';

const LEGACY_CONFIG_ERROR =
  'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init';

export function createCliApp(): CliApp {
  const bootstrapContext = createCliContext();

  const memoryCapabilities: MemoryCommandCapabilities = {
    executor: (mode, provider) => runMemoryPipeline({ mode, provider }),
    printer: (result) => {
      const stageIds = result.stages.map((stage) => stage.stageId);
      const stageSuffix = stageIds.length > 0 ? ` [stages: ${stageIds.join(', ')}]` : '';
      bootstrapContext.output.info(
        `Memory pipeline ${result.pipelineId} finished with status ${result.status} (run ${result.runId})${stageSuffix}`
      );
    },
    logger: bootstrapContext.logger,
  };

  const hostCapabilities: HostCommandCapabilities = {
    listHosts: () => getAllHostAdapters(),
    installHost: async (input) => {
      const config = await bootstrapContext.config.load();
      const logger = config ? createConfiguredCliContext(config).logger : bootstrapContext.logger;
      const installHost = createHostInstallUseCase({
        logger,
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
    writeInfo: (text) => bootstrapContext.output.info(text),
    writeError: (text) => bootstrapContext.output.error(text),
    writeSuccess: (text) => bootstrapContext.output.success(text),
    logger: bootstrapContext.logger,
    hostImportCommand,
  };

  const daemonCapabilities: DaemonCommandCapabilities = {
    runDaemon: async () => {
      const pidPath = bootstrapContext.paths.heartbeatPidPath();
      await bootstrapContext.fs.writeText(pidPath, String(process.pid));

      const heartbeatPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../engine/heartbeat.js',
      );

      bootstrapContext.logger.log('[corivo] Starting heartbeat background worker...');

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
        await bootstrapContext.fs.remove(pidPath).catch(() => {});
        process.exit(code ?? 1);
      });

      child.once('error', async (error) => {
        bootstrapContext.logger.error('[corivo] Failed to start heartbeat child process:', error);
        await bootstrapContext.fs.remove(pidPath).catch(() => {});
        process.exit(1);
      });
    },
    logger: bootstrapContext.logger,
  };

  const queryCapabilities: QueryCommandCapabilities = {
    runPromptQuery: (options) => runPromptQueryCommand(options),
    runSearchQuery: (input) =>
      runSearchQueryCommand(input, {
        loadDb: async () => {
          const config = await bootstrapContext.config.load();
          if (!config) {
            throw new ConfigError('Corivo is not initialized. Please run: corivo init');
          }
          if ((config as { encrypted_db_key?: unknown }).encrypted_db_key) {
            throw new ConfigError(LEGACY_CONFIG_ERROR);
          }
          const configuredContext = createConfiguredCliContext(config);
          return configuredContext.db.get({
            path: configuredContext.paths.databasePath(),
            enableEncryption: false,
          });
        },
        writeOutput: (text) => bootstrapContext.output.info(text),
        logger: bootstrapContext.logger,
        now: () => bootstrapContext.clock.now(),
      }),
    writeOutput: (text) => bootstrapContext.output.info(text),
    logger: bootstrapContext.logger,
  };

  return {
    commands: {
      memory: createMemoryCommand(memoryCapabilities),
      host: createHostCommand(hostCapabilities),
      daemon: createDaemonCommand(daemonCapabilities),
      query: createQueryCommand(queryCapabilities),
    },
    capabilities: {
      logger: bootstrapContext.logger,
    },
  };
}
