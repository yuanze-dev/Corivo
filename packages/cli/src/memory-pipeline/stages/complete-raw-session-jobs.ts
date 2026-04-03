import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import {
  getClaimedRawSessionJobs,
  getRawSessionJobCompletionHook,
  markRawSessionJobSucceeded,
} from '../pipeline-state.js';
import type { RawSessionJobSource } from '../sources/raw-session-job-source.js';

const STAGE_ID = 'complete-raw-session-jobs';

export interface CompleteRawSessionJobsStageOptions {
  jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;
}

export class CompleteRawSessionJobsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;

  constructor(options: CompleteRawSessionJobsStageOptions = {}) {
    this.jobCompletionHook = options.jobCompletionHook;
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const source = this.jobCompletionHook ?? getRawSessionJobCompletionHook(context.state);
    const jobs = getClaimedRawSessionJobs(context.state);

    if (!source || jobs.length === 0) {
      return {
        stageId: this.id,
        status: 'skipped',
        inputCount: jobs.length,
        outputCount: 0,
        artifactIds: [],
      };
    }

    const completionResults = await Promise.allSettled(
      jobs.map((job) => source.markSucceeded(job.job.id)),
    );

    const failures: string[] = [];
    let succeededCount = 0;

    for (const [index, result] of completionResults.entries()) {
      const job = jobs[index];
      if (!job) {
        continue;
      }

      if (result.status === 'fulfilled') {
        succeededCount += 1;
        markRawSessionJobSucceeded(context.state, job.job.id);
        continue;
      }

      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : typeof result.reason === 'string'
          ? result.reason
          : 'unknown completion failure';
      failures.push(`${job.job.id}: ${reason}`);
    }

    if (failures.length > 0) {
      return {
        stageId: this.id,
        status: 'failed',
        inputCount: jobs.length,
        outputCount: succeededCount,
        artifactIds: [],
        error: `failed to mark raw session jobs succeeded: ${failures.join('; ')}`,
      };
    }

    return {
      stageId: this.id,
      status: 'success',
      inputCount: jobs.length,
      outputCount: succeededCount,
      artifactIds: [],
    };
  }
}
