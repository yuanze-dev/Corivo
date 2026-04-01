import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { ConfigError } from '../../errors/index.js';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import {
  ArtifactStore,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
  DatabaseStaleBlockSource,
  FileRunLock,
  MemoryPipelineRunner,
  StubClaudeSessionSource,
  type ClaudeSessionSource,
  type MemoryPipelineArtifactStore,
  type MemoryPipelineDefinition,
  type MemoryPipelineRunnerOptions,
  type MemoryPipelineRunResult,
  type PipelineTrigger,
  type StaleBlockSource,
} from '@/memory-pipeline';

export type MemoryPipelineMode = 'full' | 'incremental';

export interface MemoryPipelineExecutionDependencies {
  resolveConfigDir: () => string;
  resolveDatabasePath: () => string;
  readConfig: (configDir: string) => Promise<{ encrypted_db_key?: string }>;
  createArtifactStore: (runRoot: string) => MemoryPipelineArtifactStore;
  createLock: (runRoot: string) => FileRunLock;
  createRunner: (options: MemoryPipelineRunnerOptions) => MemoryPipelineRunner;
  createInitPipeline: (options: { sessionSource: ClaudeSessionSource }) => MemoryPipelineDefinition;
  createScheduledPipeline: (options: { staleBlockSource: StaleBlockSource }) => MemoryPipelineDefinition;
  createSessionSource: () => ClaudeSessionSource;
  createStaleBlockSource: (db: CorivoDatabase) => StaleBlockSource;
  openDatabase: (dbPath: string) => CorivoDatabase;
  closeDatabase: (db: CorivoDatabase, dbPath: string) => void;
}

const defaultExecutionDependencies: MemoryPipelineExecutionDependencies = {
  resolveConfigDir: getConfigDir,
  resolveDatabasePath: getDefaultDatabasePath,
  readConfig: async (configDir) => {
    const configPath = path.join(configDir, 'config.json');
    let payload: string;

    try {
      payload = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new ConfigError('Corivo is not initialized. Please run: corivo init');
      }
      throw error;
    }

    let config: { encrypted_db_key?: string };
    try {
      config = JSON.parse(payload) as { encrypted_db_key?: string };
    } catch (error) {
      throw new ConfigError(
        `Unable to parse Corivo config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (config.encrypted_db_key) {
      throw new ConfigError(
        'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init',
      );
    }

    return config;
  },
  createArtifactStore: (runRoot) => new ArtifactStore(runRoot),
  createLock: (runRoot) => new FileRunLock(path.join(runRoot, 'run.lock')),
  createRunner: (options) => new MemoryPipelineRunner(options),
  createInitPipeline: ({ sessionSource }) => createInitMemoryPipeline({ sessionSource }),
  createScheduledPipeline: ({ staleBlockSource }) => createScheduledMemoryPipeline({ staleBlockSource }),
  createSessionSource: () => new StubClaudeSessionSource(),
  createStaleBlockSource: (db) => new DatabaseStaleBlockSource({ db }),
  openDatabase: (dbPath) => CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false }),
  closeDatabase: () => {
    /* No-op; the CorivoDatabase lifecycle is managed at the process level */
  },
};

export async function runMemoryPipeline(
  mode: MemoryPipelineMode,
  overrides: Partial<MemoryPipelineExecutionDependencies> = {},
): Promise<MemoryPipelineRunResult> {
  const dependencies = { ...defaultExecutionDependencies, ...overrides };
  const configDir = dependencies.resolveConfigDir();
  await dependencies.readConfig(configDir);

  const runRoot = path.join(configDir, 'memory-pipeline');
  const artifactStore = dependencies.createArtifactStore(runRoot);
  const lock = dependencies.createLock(runRoot);
  const runner = dependencies.createRunner({
    artifactStore,
    lock,
    runRoot,
  });

  const trigger: PipelineTrigger = {
    type: mode === 'full' ? 'init' : 'manual',
    runAt: Date.now(),
    requestedBy: 'cli',
  };

  let openedDatabase: CorivoDatabase | undefined;
  let openedDatabasePath: string | undefined;

  try {
    const pipeline =
      mode === 'full'
        ? dependencies.createInitPipeline({
            sessionSource: dependencies.createSessionSource(),
          })
        : (() => {
            const dbPath = dependencies.resolveDatabasePath();
            const db = dependencies.openDatabase(dbPath);
            openedDatabase = db;
            openedDatabasePath = dbPath;
            const staleSource = dependencies.createStaleBlockSource(db);
            return dependencies.createScheduledPipeline({ staleBlockSource: staleSource });
          })();

    return await runner.run(pipeline, trigger);
  } finally {
    if (openedDatabase && openedDatabasePath) {
      dependencies.closeDatabase(openedDatabase, openedDatabasePath);
    }
  }
}

export interface MemoryCommandOptions {
  executor?: (mode: MemoryPipelineMode) => Promise<MemoryPipelineRunResult>;
  printer?: (result: MemoryPipelineRunResult) => void;
}

function defaultPrinter(result: MemoryPipelineRunResult) {
  console.log(
    `Memory pipeline ${result.pipelineId} finished with status ${result.status} (run ${result.runId})`,
  );
}

export function createMemoryCommand({
  executor = runMemoryPipeline,
  printer = defaultPrinter,
}: MemoryCommandOptions = {}): Command {
  const memoryCommand = new Command('memory');
  memoryCommand.description('Manage memory pipelines');

  const runCommand = new Command('run');
  runCommand
    .description('Run a memory pipeline (default: incremental scheduled pipeline)')
    .option('--full', 'Trigger the init memory pipeline')
    .option('--incremental', 'Trigger the scheduled memory pipeline (default)')
    .action(async (options: { full?: boolean; incremental?: boolean }) => {
      if (options.full && options.incremental) {
        throw new Error('Cannot specify both --full and --incremental at the same time.');
      }

      const mode: MemoryPipelineMode = options.full ? 'full' : 'incremental';
      const result = await executor(mode);
      printer(result);
    });

  memoryCommand.addCommand(runCommand);
  return memoryCommand;
}

let executorOverride: MemoryCommandOptions['executor'] | undefined;
let printerOverride: MemoryCommandOptions['printer'] | undefined;

export function setMemoryCommandExecutor(executor: MemoryCommandOptions['executor']) {
  executorOverride = executor;
}

export function resetMemoryCommandExecutor() {
  executorOverride = undefined;
}

export function setMemoryCommandPrinter(printer: MemoryCommandOptions['printer']) {
  printerOverride = printer;
}

export function resetMemoryCommandPrinter() {
  printerOverride = undefined;
}

export function resetMemoryCommandOverrides() {
  executorOverride = undefined;
  printerOverride = undefined;
}

export function getMemoryCommand() {
  return createMemoryCommand({
    executor: executorOverride ?? runMemoryPipeline,
    printer: printerOverride ?? defaultPrinter,
  });
}
