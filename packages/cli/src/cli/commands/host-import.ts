import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigError } from '@/domain/errors/index.js';
import {
  createHostImportUseCase,
  persistImportedSessions,
} from '@/application/hosts/import-host';
import { createEnqueueSessionExtractionUseCase } from '@/application/memory-ingest/enqueue-session-extraction';
import type { HostId, HostImportResult } from '@/domain/host/contracts/types.js';
import type { HostImportRequest } from '@/application/hosts/import-host';
import { HostImportCursorStore } from '@/infrastructure/storage/repositories/host-import-cursor-store';
import { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue';
import { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import {
  createCliLogger,
  createCliOutput,
  createConfiguredCliLogger,
  getCliConfigDir,
  loadCliConfig,
} from '@/cli/runtime';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';
import { createSyncSessionTranscriptToProviderUseCase } from '@/application/memory-ingest/sync-session-transcript-to-provider.js';
import { createFileSessionSyncTracker } from '@/application/memory-ingest/session-sync-tracker.js';

interface HostImportCommandOptions {
  all?: boolean;
  since?: string;
  limit?: string;
  dryRun?: boolean;
  target?: string;
}

function parseLimit(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new Error('--limit must be a positive integer.');
  }

  return parsed;
}

export interface HostImportCommandDeps {
  executeImport?: (input: HostImportRequest) => Promise<HostImportResult>;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

export function createHostImportCommand(deps: HostImportCommandDeps = {}): Command {
  return new Command('import')
    .description('Import history from a host integration')
    .argument('<host>', 'Host id')
    .option('--all', 'Import all history from the host')
    .option('--since <cursor>', 'Import incrementally from a specific cursor')
    .option('--limit <number>', 'Limit imported sessions')
    .option('--dry-run', 'Run import without persisting data')
    .option('-t, --target <path>', 'Target path')
    .action(async (host: HostId, options: HostImportCommandOptions) => {
      const logger = createCliLogger();
      const output = createCliOutput(logger);
      const writeStdout = deps.writeStdout ?? ((text: string) => output.info(text));
      const writeStderr = deps.writeStderr ?? ((text: string) => output.error(text));
      if (options.all && options.since) {
        throw new Error('Cannot use --all with --since.');
      }

      const executeImport = deps.executeImport ?? await createDefaultExecuteImport();
      const result = await executeImport({
        host,
        all: options.all ? true : undefined,
        since: options.since,
        limit: parseLimit(options.limit),
        dryRun: options.dryRun ? true : undefined,
        target: options.target,
      });

      if (!result.success) {
        writeStderr(chalk.red(result.error || result.summary));
        process.exitCode = 1;
        return;
      }

      writeStdout(chalk.green(result.summary));
    });
}

export const hostImportCommand = createHostImportCommand();

async function createDefaultExecuteImport() {
  const config = await loadCliConfig();
  const logger = createConfiguredCliLogger(config);
  const db = await loadRuntimeDb({ password: false });
  if (!db) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const repository = new RawMemoryRepository(db);
  const queue = new MemoryProcessingJobQueue(db);
  const cursors = new HostImportCursorStore(db);
  const enqueueSessionExtraction = createEnqueueSessionExtractionUseCase({ queue });
  const tracker = createFileSessionSyncTracker(getCliConfigDir());
  const syncSessionTranscript =
    config?.memoryEngine?.provider === 'supermemory'
      ? createSyncSessionTranscriptToProviderUseCase({
          repository,
          provider: resolveMemoryProvider(config),
          readCheckpoint: tracker.readCheckpoint,
          writeCheckpoint: tracker.writeCheckpoint,
        })
      : undefined;

  return createHostImportUseCase({
    getLastCursor: (host) => cursors.get(host) ?? undefined,
    saveLastCursor: (host, cursor) => cursors.set(host, cursor),
    persistImportResult: async (result) => {
      await persistImportedSessions(result, {
        repository,
        enqueueSessionExtraction,
        syncSessionTranscript,
      });
    },
    logger,
  });
}
