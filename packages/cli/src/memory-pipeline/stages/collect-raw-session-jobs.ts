import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import {
  RAW_SESSION_JOBS_STATE_KEY,
  RAW_SESSION_JOB_SOURCE_STATE_KEY,
} from '../pipeline-state.js';
import type { RawSessionJobSource } from '../sources/raw-session-job-source.js';

const STAGE_ID = 'collect-raw-session-jobs';

export class CollectRawSessionJobsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  constructor(private readonly source: RawSessionJobSource) {
    if (!source || typeof source.collect !== 'function') {
      throw new Error('RawSessionJobSource is required');
    }
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const jobs = await this.source.collect();
    context.state.set(RAW_SESSION_JOBS_STATE_KEY, jobs);
    context.state.set(RAW_SESSION_JOB_SOURCE_STATE_KEY, this.source);
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
