import path from 'node:path';
import {
  createMemoryPipelineState,
  getPendingClaimedRawSessionJobs,
  getRawSessionJobCompletionHook,
} from './pipeline-state.js';
import { writeRunManifest } from './state/run-manifest.js';
import type {
  MemoryPipelineContext,
  MemoryPipelineDefinition,
  PipelineStageResult,
  PipelineStageFailureClassification,
  PipelineTrigger,
} from './types.js';
import type { RunManifest } from './state/run-manifest.js';
import type { FileRunLock } from './state/run-lock.js';
import type { MemoryPipelineState } from './pipeline-state.js';

export interface MemoryPipelineRunnerOptions {
  artifactStore: MemoryPipelineContext['artifactStore'];
  lock: FileRunLock;
  runRoot: string;
  logger?: MemoryPipelineContext['logger'];
  runIdGenerator?: () => string;
  manifestWriter?: (manifestPath: string, manifest: RunManifest) => Promise<void>;
}

export interface MemoryPipelineRunResult {
  runId: string;
  pipelineId: string;
  trigger: PipelineTrigger['type'];
  stageCount: number;
  startedAt: number;
  completedAt: number;
  status: 'success' | 'failed';
  stages: PipelineStageResult[];
}

export class MemoryPipelineRunner {
  constructor(private readonly options: MemoryPipelineRunnerOptions) {}

  async run(pipeline: MemoryPipelineDefinition, trigger: PipelineTrigger): Promise<MemoryPipelineRunResult> {
    const runId = this.options.runIdGenerator?.() ?? this.createRunId();
    const startedAt = Date.now();
    const manifestPath = path.join(this.options.runRoot, 'runs', runId, 'manifest.json');
    this.debug(`starting pipeline=${pipeline.id} run=${runId} trigger=${trigger.type} stageCount=${pipeline.stages.length}`);
    await this.options.lock.acquire(runId);
    this.debug(`acquired lock run=${runId}`);

    const manifest: RunManifest = {
      runId,
      pipelineId: pipeline.id,
      trigger: trigger.type,
      status: 'running',
      stages: [],
    };

    const stageResults: PipelineStageResult[] = [];
    manifest.stages = stageResults;
    const manifestWriter = this.options.manifestWriter ?? writeRunManifest;
    const context: MemoryPipelineContext = {
      runId,
      trigger,
      artifactStore: this.options.artifactStore,
      state: createMemoryPipelineState(),
      logger: this.options.logger,
    };

    try {
      await manifestWriter(manifestPath, manifest);
      this.debug(`wrote initial manifest path=${manifestPath}`);
      for (const stage of pipeline.stages) {
        this.debug(`stage start pipeline=${pipeline.id} run=${runId} stage=${stage.id}`);
        const result = await this.executeStage(stage, context);
        stageResults.push(result);
        this.debug(
          `stage complete pipeline=${pipeline.id} run=${runId} stage=${stage.id} status=${result.status} input=${result.inputCount} output=${result.outputCount} artifacts=${result.artifactIds.length} durationMs=${result.durationMs ?? 0} failureClassification=${result.failureClassification ?? 'none'}`
        );
        manifest.status = result.status === 'failed' ? 'failed' : 'running';
        await manifestWriter(manifestPath, manifest);
        this.debug(`updated manifest path=${manifestPath} status=${manifest.status}`);

        if (result.status === 'failed') {
          await this.markClaimedJobsFailed(context.state, result.error ?? `${stage.id} failed`);
          this.debug(`pipeline failed pipeline=${pipeline.id} run=${runId} failedStage=${stage.id}`);
          return this.buildResult(
            runId,
            pipeline.id,
            trigger.type,
            pipeline.stages.length,
            'failed',
            stageResults,
            startedAt,
            Date.now(),
          );
        }
      }

      manifest.status = 'success';
      await manifestWriter(manifestPath, manifest);
      this.debug(`pipeline succeeded pipeline=${pipeline.id} run=${runId}`);
      return this.buildResult(
        runId,
        pipeline.id,
        trigger.type,
        pipeline.stages.length,
        'success',
        stageResults,
        startedAt,
        Date.now(),
      );
    } catch (error) {
      await this.markClaimedJobsFailed(context.state, this.toErrorMessage(error));
      this.debug(`pipeline threw pipeline=${pipeline.id} run=${runId} error=${this.toErrorMessage(error)}`);
      throw error;
    } finally {
      await this.options.lock.release();
      this.debug(`released lock run=${runId}`);
    }
  }

  private async executeStage(
    stage: MemoryPipelineDefinition['stages'][number],
    context: MemoryPipelineContext,
  ): Promise<PipelineStageResult> {
    const startedAt = Date.now();
    try {
      const result = await stage.run(context);
      return this.withDuration(
        {
          ...result,
          failureClassification:
            result.status === 'failed'
              ? result.failureClassification ?? 'stage-failed'
              : result.failureClassification,
        },
        startedAt,
      );
    } catch (error) {
      return this.buildFailedStageResult(stage.id, error, 'stage-exception', startedAt);
    }
  }

  private async markClaimedJobsFailed(state: MemoryPipelineState, error: string): Promise<void> {
    const source = getRawSessionJobCompletionHook(state);
    const jobs = getPendingClaimedRawSessionJobs(state);

    if (!source || jobs.length === 0) {
      return;
    }

    await Promise.allSettled(jobs.map((job) => source.markFailed(job.job.id, error)));
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'memory pipeline failed unexpectedly';
  }

  private buildFailedStageResult(
    stageId: string,
    error: unknown,
    failureClassification: PipelineStageFailureClassification,
    startedAt: number,
  ): PipelineStageResult {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'stage failed unexpectedly';

    const result: PipelineStageResult = {
      stageId,
      status: 'failed',
      inputCount: 0,
      outputCount: 0,
      artifactIds: [],
      failureClassification,
      error: message,
    };

    return this.withDuration(result, startedAt);
  }

  private buildResult(
    runId: string,
    pipelineId: MemoryPipelineDefinition['id'],
    trigger: PipelineTrigger['type'],
    pipelineStageCount: number,
    status: 'success' | 'failed',
    stages: PipelineStageResult[],
    startedAt: number,
    completedAt: number,
  ): MemoryPipelineRunResult {
    return {
      runId,
      pipelineId,
      trigger,
      stageCount: pipelineStageCount,
      startedAt,
      completedAt,
      status,
      stages,
    };
  }

  private withDuration(stage: PipelineStageResult, startedAt: number): PipelineStageResult {
    return {
      ...stage,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }

  private createRunId(): string {
    const timestamp = Date.now();
    const suffix = Math.random().toString(16).slice(2, 8);
    return `run-${timestamp}-${suffix}`;
  }

  private debug(message: string): void {
    this.options.logger?.debug?.(`[memory:pipeline:runner] ${message}`);
  }
}
