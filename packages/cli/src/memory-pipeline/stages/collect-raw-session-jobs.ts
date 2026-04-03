import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { setClaimedRawSessionJobs } from '../pipeline-state.js';
import type { RawSessionJobSource } from '../sources/raw-session-job-source.js';

export const COLLECT_RAW_SESSION_JOBS_STAGE_ID = 'collect-raw-session-jobs';

export interface CollectRawSessionJobsStageOptions {
  source: RawSessionJobSource;
  jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;
}

export const createCollectRawSessionJobsStage = (
  sourceOrOptions: RawSessionJobSource | CollectRawSessionJobsStageOptions,
): MemoryPipelineStage => {
  const { source, jobCompletionHook } = resolveCollectRawSessionJobsOptions(sourceOrOptions);

  return {
    id: COLLECT_RAW_SESSION_JOBS_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const jobs = await source.collect();
      setClaimedRawSessionJobs(context.state, {
        jobs,
        source: jobCompletionHook,
      });
      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'work-item',
        source: COLLECT_RAW_SESSION_JOBS_STAGE_ID,
        body: JSON.stringify(jobs),
      });

      return {
        stageId: COLLECT_RAW_SESSION_JOBS_STAGE_ID,
        status: 'success',
        inputCount: jobs.length,
        outputCount: jobs.length,
        artifactIds: [descriptor.id],
      };
    },
  };
};

const resolveCollectRawSessionJobsOptions = (
  sourceOrOptions: RawSessionJobSource | CollectRawSessionJobsStageOptions,
): {
  source: RawSessionJobSource;
  jobCompletionHook?: Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;
} => {
  if (typeof (sourceOrOptions as RawSessionJobSource)?.collect === 'function') {
    const source = sourceOrOptions as RawSessionJobSource;
    return {
      source,
      jobCompletionHook: source,
    };
  }

  const options = sourceOrOptions as CollectRawSessionJobsStageOptions;
  const source = options?.source;
  if (!source || typeof source.collect !== 'function') {
    throw new Error('RawSessionJobSource is required');
  }

  return {
    source,
    jobCompletionHook: options.jobCompletionHook ?? source,
  };
};
