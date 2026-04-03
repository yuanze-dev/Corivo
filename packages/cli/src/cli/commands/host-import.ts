import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigError } from '@/errors';
import {
  createHostImportUseCase,
  persistImportedSessions,
} from '@/application/hosts/import-host';
import { createEnqueueSessionExtractionUseCase } from '@/application/memory-ingest/enqueue-session-extraction';
import type { HostId, HostImportResult } from '@/hosts';
import type { HostImportRequest } from '@/application/hosts/import-host';
import { HostImportCursorStore } from '@/raw-memory/import-cursors';
import { MemoryProcessingJobQueue } from '@/raw-memory/job-queue';
import { RawMemoryRepository } from '@/raw-memory/repository';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import { createCliContext } from '@/cli/context';
import { createConfiguredCliContext } from '@/cli/context';

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
      const context = createCliContext();
      const writeStdout = deps.writeStdout ?? ((text: string) => context.output.info(text));
      const writeStderr = deps.writeStderr ?? ((text: string) => context.output.error(text));
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
  const bootstrapContext = createCliContext();
  const config = await bootstrapContext.config.load();
  const context = createConfiguredCliContext(config);
  const db = await loadRuntimeDb({ password: false });
  if (!db) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  const repository = new RawMemoryRepository(db);
  const queue = new MemoryProcessingJobQueue(db);
  const cursors = new HostImportCursorStore(db);
  const enqueueSessionExtraction = createEnqueueSessionExtractionUseCase({ queue });

  return createHostImportUseCase({
    getLastCursor: (host) => cursors.get(host) ?? undefined,
    saveLastCursor: (host, cursor) => cursors.set(host, cursor),
    persistImportResult: async (result) => {
      await persistImportedSessions(result, {
        repository,
        enqueueSessionExtraction,
      });
    },
    logger: context.logger,
  });
}
