import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import {
  type ClaudeSessionSource,
  FileRunLock,
  type MemoryPipelineArtifactStore,
  type MemoryPipelineDefinition,
  MemoryPipelineRunner,
  type MemoryPipelineRunnerOptions,
  type MemoryPipelineRunResult,
  type PipelineTrigger,
  type RawSessionJobSource,
} from '@/memory-pipeline';
import type { Logger } from '@/utils/logging';
import type { ExtractionProvider } from '@/extraction/types';
import { readMemoryPipelineConfig } from './config.js';
import { createMemoryPipelineLogger } from './logger.js';
import { buildInitMemoryPipeline, buildScheduledMemoryPipeline } from './pipelines.js';
import {
  closeMemoryPipelineDatabase,
  createMemoryPipelineArtifactStore,
  createMemoryPipelineLock,
  createMemoryPipelineRunner,
  getMemoryPipelineRunRoot,
  openMemoryPipelineDatabase,
} from './runtime.js';
import { createDatabaseRawSessionJobSource, createDatabaseSessionSource } from './sources.js';
import { createMemoryPipelineTrigger } from './trigger.js';

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
  createLogger: createMemoryPipelineLogger,
  readConfig: readMemoryPipelineConfig,
  createArtifactStore: createMemoryPipelineArtifactStore,
  createLock: createMemoryPipelineLock,
  createRunner: createMemoryPipelineRunner,
  createInitPipeline: buildInitMemoryPipeline,
  createScheduledPipeline: buildScheduledMemoryPipeline,
  createSessionSource: createDatabaseSessionSource,
  createRawSessionJobSource: createDatabaseRawSessionJobSource,
  openDatabase: openMemoryPipelineDatabase,
  closeDatabase: closeMemoryPipelineDatabase,
  createTrigger: createMemoryPipelineTrigger,
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

  const runRoot = getMemoryPipelineRunRoot(configDir);
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
