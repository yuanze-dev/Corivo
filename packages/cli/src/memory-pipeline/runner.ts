import path from 'node:path';
import { writeRunManifest } from './state/run-manifest.js';
import type {
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineDefinition,
  PipelineStageResult,
  PipelineTrigger,
} from './types.js';
import type { RunManifest } from './state/run-manifest.js';
import type { FileRunLock } from './state/run-lock.js';

export interface MemoryPipelineRunnerOptions {
  artifactStore: MemoryPipelineArtifactStore;
  lock: FileRunLock;
  runRoot: string;
  logger?: MemoryPipelineContext['logger'];
  runIdGenerator?: () => string;
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
    await writeRunManifest(manifestPath, manifest);

    try {
      for (const stage of pipeline.stages) {
        const result = await this.executeStage(stage, runId, trigger);
        stageResults.push(result);
        manifest.status = result.status === 'failed' ? 'failed' : 'running';
        await writeRunManifest(manifestPath, manifest);

        if (result.status === 'failed') {
          return this.buildResult(runId, pipeline.id, 'failed', stageResults);
        }
      }

      manifest.status = 'success';
      await writeRunManifest(manifestPath, manifest);
      return this.buildResult(runId, pipeline.id, 'success', stageResults);
    } finally {
      await this.options.lock.release();
    }
  }

  private async executeStage(
    stage: MemoryPipelineDefinition['stages'][number],
    runId: string,
    trigger: PipelineTrigger,
  ): Promise<PipelineStageResult> {
    const context: MemoryPipelineContext = {
      runId,
      trigger,
      artifactStore: this.options.artifactStore,
      logger: this.options.logger,
    };

    try {
      return await stage.run(context);
    } catch (error) {
      return this.buildFailedStageResult(stage.id, error);
    }
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
