import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { setClaimedRawSessionJobs } from '../pipeline-state.js';
import type { RawSessionJobSource } from '../sources/raw-session-job-source.js';

const STAGE_ID = 'collect-raw-session-jobs';

export interface CollectRawSessionJobsStageOptions {
  source: RawSessionJobSource;
  jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;
}

export class CollectRawSessionJobsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly source: RawSessionJobSource;
  private readonly jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;

  constructor(sourceOrOptions: RawSessionJobSource | CollectRawSessionJobsStageOptions) {
    if (typeof (sourceOrOptions as RawSessionJobSource)?.collect === 'function') {
      this.source = sourceOrOptions as RawSessionJobSource;
      this.jobCompletionHook = sourceOrOptions as RawSessionJobSource;
    } else {
      const options = sourceOrOptions as CollectRawSessionJobsStageOptions;
      this.source = options?.source;
      this.jobCompletionHook = options?.jobCompletionHook ?? options?.source;
    }

    const source = this.source;
    if (!source || typeof source.collect !== 'function') {
      throw new Error('RawSessionJobSource is required');
    }
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const jobs = await this.source.collect();
    setClaimedRawSessionJobs(context.state, {
      jobs,
      source: this.jobCompletionHook,
    });
    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'work-item',
      source: this.id,
      body: JSON.stringify(jobs),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: jobs.length,
      outputCount: jobs.length,
      artifactIds: [descriptor.id],
    };
  }
}
