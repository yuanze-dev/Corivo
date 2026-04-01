import path from 'node:path';
import { getRawSessionJobs, getRawSessionJobSource } from './pipeline-state.js';
import { writeRunManifest } from './state/run-manifest.js';
import type {
  MemoryPipelineContext,
  MemoryPipelineDefinition,
  PipelineStageResult,
  PipelineTrigger,
} from './types.js';
import type { RunManifest } from './state/run-manifest.js';
import type { FileRunLock } from './state/run-lock.js';

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
  status: 'success' | 'failed';
  stages: PipelineStageResult[];
}

export class MemoryPipelineRunner {
  constructor(private readonly options: MemoryPipelineRunnerOptions) {}

  async run(pipeline: MemoryPipelineDefinition, trigger: PipelineTrigger): Promise<MemoryPipelineRunResult> {
    const runId = this.options.runIdGenerator?.() ?? this.createRunId();
    const manifestPath = path.join(this.options.runRoot, 'runs', runId, 'manifest.json');
    await this.options.lock.acquire(runId);

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
      state: new Map(),
      logger: this.options.logger,
    };

    try {
      await manifestWriter(manifestPath, manifest);
      for (const stage of pipeline.stages) {
        const result = await this.executeStage(stage, context);
        stageResults.push(result);
        manifest.status = result.status === 'failed' ? 'failed' : 'running';
        await manifestWriter(manifestPath, manifest);

        if (result.status === 'failed') {
          await this.markClaimedJobsFailed(context.state, result.error ?? `${stage.id} failed`);
          return this.buildResult(runId, pipeline.id, 'failed', stageResults);
        }
      }

      manifest.status = 'success';
      await manifestWriter(manifestPath, manifest);
      return this.buildResult(runId, pipeline.id, 'success', stageResults);
    } catch (error) {
      await this.markClaimedJobsFailed(context.state, this.toErrorMessage(error));
      throw error;
    } finally {
      await this.options.lock.release();
    }
  }

  private async executeStage(
    stage: MemoryPipelineDefinition['stages'][number],
    context: MemoryPipelineContext,
  ): Promise<PipelineStageResult> {
    try {
      return await stage.run(context);
    } catch (error) {
      return this.buildFailedStageResult(stage.id, error);
    }
  }

  private async markClaimedJobsFailed(state: Map<string, unknown>, error: string): Promise<void> {
    const source = getRawSessionJobSource(state);
    const jobs = getRawSessionJobs(state);

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

  private buildFailedStageResult(stageId: string, error: unknown): PipelineStageResult {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'stage failed unexpectedly';

    return {
      stageId,
      status: 'failed',
      inputCount: 0,
      outputCount: 0,
      artifactIds: [],
      error: message,
    };
  }

  private buildResult(
    runId: string,
    pipelineId: MemoryPipelineDefinition['id'],
    status: 'success' | 'failed',
    stages: PipelineStageResult[],
  ): MemoryPipelineRunResult {
    return { runId, pipelineId, status, stages };
  }

  private createRunId(): string {
    const timestamp = Date.now();
    const suffix = Math.random().toString(16).slice(2, 8);
    return `run-${timestamp}-${suffix}`;
  }
}
