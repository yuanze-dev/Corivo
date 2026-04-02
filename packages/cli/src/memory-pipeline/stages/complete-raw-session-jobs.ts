import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { getRawSessionJobs, getRawSessionJobSource } from '../pipeline-state.js';

const STAGE_ID = 'complete-raw-session-jobs';

export class CompleteRawSessionJobsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const source = getRawSessionJobSource(context.state);
    const jobs = getRawSessionJobs(context.state);

    if (!source || jobs.length === 0) {
      return {
        stageId: this.id,
        status: 'skipped',
        inputCount: jobs.length,
        outputCount: 0,
        artifactIds: [],
      };
    }

    await Promise.all(jobs.map((job) => source.markSucceeded(job.job.id)));

    return {
      stageId: this.id,
      status: 'success',
      inputCount: jobs.length,
      outputCount: jobs.length,
      artifactIds: [],
    };
  }
}
