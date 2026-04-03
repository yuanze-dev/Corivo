import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import {
  ArtifactStore,
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
  DatabaseRawSessionJobSource,
  DatabaseRawSessionRecordSource,
  type ClaudeSessionSource,
  FileRunLock,
  type MemoryPipelineDefinition,
  type MemoryPipelineArtifactStore,
  MemoryPipelineRunner,
  type MemoryPipelineRunResult,
  type PipelineTrigger,
  type RawSessionJobSource,
} from '@/memory-pipeline';
import type { Logger } from '@/utils/logging';
import type { ExtractionProvider } from '@/infrastructure/llm/types';
import { createLogger } from '@/utils/logging';
import { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue';
import { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository';
import { readMemoryPipelineConfig } from './config.js';
import { createMemoryPipelineArtifactStore, getMemoryPipelineRunRoot } from './runtime.js';
import { createDatabaseRawSessionJobSource, createDatabaseSessionSource } from './sources.js';

export type MemoryPipelineMode = 'full' | 'incremental';
export const DEFAULT_MEMORY_PROVIDER: ExtractionProvider = 'claude';

export interface MemoryPipelineRuntimeDependencies {
  resolveConfigDir: () => string;
  resolveDatabasePath: () => string;
  createLogger: () => Logger;
  readConfig: (configDir: string) => Promise<{ encrypted_db_key?: string }>;
  openDatabase: (dbPath: string) => CorivoDatabase;
  closeDatabase: (db: CorivoDatabase, dbPath: string) => void;
}

export interface MemoryPipelineExecutionDependencies {
  runtime?: Partial<MemoryPipelineRuntimeDependencies>;
  buildPipeline?: (input: {
    mode: MemoryPipelineMode;
    provider: ExtractionProvider;
    db: CorivoDatabase;
  }) => MemoryPipelineDefinition;
  createTrigger?: (mode: MemoryPipelineMode) => PipelineTrigger;
  runPipeline?: (input: {
    pipeline: MemoryPipelineDefinition;
    trigger: PipelineTrigger;
    logger: Logger;
    runRoot: string;
  }) => Promise<MemoryPipelineRunResult>;
}

export interface RunMemoryPipelineOptions {
  mode: MemoryPipelineMode;
  provider?: ExtractionProvider;
  dependencies?: MemoryPipelineExecutionDependencies;
}

const defaultRuntimeDependencies: MemoryPipelineRuntimeDependencies = {
  resolveConfigDir: getConfigDir,
  resolveDatabasePath: getDefaultDatabasePath,
  createLogger: createLogger,
  readConfig: readMemoryPipelineConfig,
  openDatabase: (dbPath) => CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false }),
  closeDatabase: () => {
    // No-op; the CorivoDatabase lifecycle is managed at the process level.
  },
};

export async function runMemoryPipeline(
  options: RunMemoryPipelineOptions,
): Promise<MemoryPipelineRunResult> {
  const { mode, provider = DEFAULT_MEMORY_PROVIDER, dependencies: dependencyOverrides } = options;
  const runtime = { ...defaultRuntimeDependencies, ...(dependencyOverrides?.runtime ?? {}) };
  const buildPipeline = dependencyOverrides?.buildPipeline ?? defaultBuildPipeline;
  const createTrigger = dependencyOverrides?.createTrigger ?? ((mode) => ({
    type: mode === 'full' ? 'init' : 'manual',
    runAt: Date.now(),
    requestedBy: 'cli',
  }));
  const runPipeline = dependencyOverrides?.runPipeline ?? defaultRunPipeline;
  const logger = runtime.createLogger();
  const configDir = runtime.resolveConfigDir();
  logger.debug(`[memory:pipeline] starting mode=${mode} provider=${provider} configDir=${configDir}`);
  await runtime.readConfig(configDir);
  logger.debug(`[memory:pipeline] config loaded configDir=${configDir}`);

  const runRoot = getMemoryPipelineRunRoot(configDir);
  logger.debug(`[memory:pipeline] runtime ready runRoot=${runRoot}`);

  let openedDatabase: CorivoDatabase | undefined;
  let openedDatabasePath: string | undefined;

  try {
    const dbPath = runtime.resolveDatabasePath();
    const db = runtime.openDatabase(dbPath);
    openedDatabase = db;
    openedDatabasePath = dbPath;
    logger.debug(`[memory:pipeline] opened database path=${dbPath}`);

    const pipeline = buildPipeline({
      mode,
      provider,
      db,
    });
    logger.debug(
      `[memory:pipeline] built pipeline id=${pipeline.id} provider=${provider} stageCount=${pipeline.stages.length}`
    );

    const trigger = createTrigger(mode);
    logger.debug(
      `[memory:pipeline] created trigger type=${trigger.type} requestedBy=${trigger.requestedBy ?? 'unknown'} runAt=${trigger.runAt}`
    );

    const result = await runPipeline({ pipeline, trigger, logger, runRoot });
    const failedStage = result.stages.find((stage) => stage.status === 'failed');
    logger.debug(
      `[memory:pipeline] completed pipeline=${result.pipelineId} status=${result.status} run=${result.runId} trigger=${result.trigger} stageCount=${result.stageCount} failedStage=${failedStage?.stageId ?? 'none'} failureClassification=${failedStage?.failureClassification ?? 'none'}`
    );
    return result;
  } finally {
    if (openedDatabase && openedDatabasePath) {
      logger.debug(`[memory:pipeline] closing database path=${openedDatabasePath}`);
      runtime.closeDatabase(openedDatabase, openedDatabasePath);
      logger.debug(`[memory:pipeline] closed database path=${openedDatabasePath}`);
    }
  }
}

function defaultBuildPipeline(input: {
  mode: MemoryPipelineMode;
  provider: ExtractionProvider;
  db: CorivoDatabase;
}): MemoryPipelineDefinition {
  if (input.mode === 'full') {
    return createInitMemoryPipeline({
      sessionSource: createDatabaseSessionSource(input.db) as ClaudeSessionSource,
      provider: input.provider,
    });
  }

  return createScheduledMemoryPipeline({
    rawSessionJobSource: createDatabaseRawSessionJobSource(input.db) as RawSessionJobSource,
    provider: input.provider,
  });
}

async function defaultRunPipeline(input: {
  pipeline: MemoryPipelineDefinition;
  trigger: PipelineTrigger;
  logger: Logger;
  runRoot: string;
}): Promise<MemoryPipelineRunResult> {
  const artifactStore = createMemoryPipelineArtifactStore(input.runRoot);
  const lock = new FileRunLock(`${input.runRoot}/run.lock`);
  const runner = new MemoryPipelineRunner({
    artifactStore,
    lock,
    logger: input.logger,
    runRoot: input.runRoot,
  });
  input.logger.debug(`[memory:pipeline] resources ready runRoot=${input.runRoot}`);
  input.logger.debug('[memory:pipeline] runner ready');
  return runner.run(input.pipeline, input.trigger);
}
