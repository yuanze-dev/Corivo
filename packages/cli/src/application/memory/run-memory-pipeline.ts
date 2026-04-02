import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigError } from '@/errors';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { MemoryProcessingJobQueue } from '@/raw-memory/job-queue';
import { RawMemoryRepository } from '@/raw-memory/repository';
import {
  ArtifactStore,
  type ClaudeSessionSource,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
  DatabaseRawSessionJobSource,
  DatabaseRawSessionRecordSource,
  FileRunLock,
  type MemoryPipelineArtifactStore,
  type MemoryPipelineDefinition,
  MemoryPipelineRunner,
  type MemoryPipelineRunnerOptions,
  type MemoryPipelineRunResult,
  type PipelineTrigger,
  type RawSessionJobSource,
} from '@/memory-pipeline';
import { createCliContext } from '@/cli/context';
import type { Logger } from '@/utils/logging';
import type { ExtractionProvider } from '@/extraction/types';

export type MemoryPipelineMode = 'full' | 'incremental';
export const DEFAULT_MEMORY_PROVIDER: ExtractionProvider = 'claude';

export interface MemoryPipelineExecutionDependencies {
  resolveConfigDir: () => string;
  resolveDatabasePath: () => string;
  createLogger: () => Logger;
  readConfig: (configDir: string) => Promise<{ encrypted_db_key?: string }>;
  createArtifactStore: (runRoot: string) => MemoryPipelineArtifactStore;
  createLock: (runRoot: string) => FileRunLock;
  createRunner: (options: MemoryPipelineRunnerOptions) => MemoryPipelineRunner;
  createInitPipeline: (options: {
    sessionSource: ClaudeSessionSource;
    provider: ExtractionProvider;
  }) => MemoryPipelineDefinition;
  createScheduledPipeline: (options: {
    rawSessionJobSource: RawSessionJobSource;
    provider: ExtractionProvider;
  }) => MemoryPipelineDefinition;
  createSessionSource: (db: CorivoDatabase) => ClaudeSessionSource;
  createRawSessionJobSource: (db: CorivoDatabase) => RawSessionJobSource;
  openDatabase: (dbPath: string) => CorivoDatabase;
  closeDatabase: (db: CorivoDatabase, dbPath: string) => void;
  createTrigger: (mode: MemoryPipelineMode) => PipelineTrigger;
}

export type RunMemoryPipelineOptions = {
  mode: MemoryPipelineMode;
  provider?: ExtractionProvider;
} & Partial<MemoryPipelineExecutionDependencies>;

const defaultExecutionDependencies: MemoryPipelineExecutionDependencies = {
  resolveConfigDir: getConfigDir,
  resolveDatabasePath: getDefaultDatabasePath,
  createLogger: () => createCliContext().logger,
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
        `Unable to parse Corivo config: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (config.encrypted_db_key) {
      throw new ConfigError(
        'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init'
      );
    }

    return config;
  },
  createArtifactStore: (runRoot) => new ArtifactStore(runRoot),
  createLock: (runRoot) => new FileRunLock(path.join(runRoot, 'run.lock')),
  createRunner: (options) => new MemoryPipelineRunner(options),
  createInitPipeline: ({ sessionSource }) => createInitMemoryPipeline({ sessionSource }),
  createScheduledPipeline: ({ rawSessionJobSource }) =>
    createScheduledMemoryPipeline({ rawSessionJobSource }),
  createSessionSource: (db) =>
    new DatabaseRawSessionRecordSource({
      repository: {
        listRawSessions: () => db.listRawSessions(),
        getRawTranscript: (sessionKey) => db.getRawTranscript(sessionKey),
      },
    }) as ClaudeSessionSource,
  createRawSessionJobSource: (db) =>
    new DatabaseRawSessionJobSource({
      queue: new MemoryProcessingJobQueue(db),
      repository: new RawMemoryRepository(db),
    }),
  openDatabase: (dbPath) => CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false }),
  closeDatabase: () => {
    /* No-op; the CorivoDatabase lifecycle is managed at the process level */
  },
  createTrigger: (mode) => ({
    type: mode === 'full' ? 'init' : 'manual',
    runAt: Date.now(),
    requestedBy: 'cli',
  }),
};

export async function runMemoryPipeline(
  options: RunMemoryPipelineOptions,
): Promise<MemoryPipelineRunResult> {
  const { mode, provider = DEFAULT_MEMORY_PROVIDER, ...dependencyOverrides } = options;
  const dependencies = { ...defaultExecutionDependencies, ...dependencyOverrides };
  const logger = dependencies.createLogger();
  const configDir = dependencies.resolveConfigDir();
  logger.debug(`[memory:pipeline] starting mode=${mode} provider=${provider} configDir=${configDir}`);
  await dependencies.readConfig(configDir);
  logger.debug(`[memory:pipeline] config loaded configDir=${configDir}`);

  const runRoot = path.join(configDir, 'memory-pipeline');
  const artifactStore = dependencies.createArtifactStore(runRoot);
  const lock = dependencies.createLock(runRoot);
  const runner = dependencies.createRunner({
    artifactStore,
    lock,
    logger,
    runRoot,
  });
  logger.debug(`[memory:pipeline] resources ready runRoot=${runRoot}`);
  logger.debug('[memory:pipeline] runner ready');

  let openedDatabase: CorivoDatabase | undefined;
  let openedDatabasePath: string | undefined;

  try {
    const dbPath = dependencies.resolveDatabasePath();
    const db = dependencies.openDatabase(dbPath);
    openedDatabase = db;
    openedDatabasePath = dbPath;
    logger.debug(`[memory:pipeline] opened database path=${dbPath}`);

    const pipeline =
      mode === 'full'
        ? dependencies.createInitPipeline({
            sessionSource: dependencies.createSessionSource(db),
            provider,
          })
        : dependencies.createScheduledPipeline({
            rawSessionJobSource: dependencies.createRawSessionJobSource(db),
            provider,
          });
    logger.debug(
      `[memory:pipeline] built pipeline id=${pipeline.id} provider=${provider} stageCount=${pipeline.stages.length}`
    );

    const trigger = dependencies.createTrigger(mode);
    logger.debug(
      `[memory:pipeline] created trigger type=${trigger.type} requestedBy=${trigger.requestedBy ?? 'unknown'} runAt=${trigger.runAt}`
    );

    const result = await runner.run(pipeline, trigger);
    logger.debug(
      `[memory:pipeline] completed pipeline=${result.pipelineId} status=${result.status} run=${result.runId}`
    );
    return result;
  } finally {
    if (openedDatabase && openedDatabasePath) {
      logger.debug(`[memory:pipeline] closing database path=${openedDatabasePath}`);
      dependencies.closeDatabase(openedDatabase, openedDatabasePath);
      logger.debug(`[memory:pipeline] closed database path=${openedDatabasePath}`);
    }
  }
}
