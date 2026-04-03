import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

export const CONSOLIDATE_SESSION_SUMMARIES_STAGE_ID = 'consolidate-session-summaries';

export const createConsolidateSessionSummariesStage = (): MemoryPipelineStage => {
  return {
    id: CONSOLIDATE_SESSION_SUMMARIES_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const payload = {
        runId: context.runId,
        stage: CONSOLIDATE_SESSION_SUMMARIES_STAGE_ID,
        consolidated: [],
      };

      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'summary',
        source: CONSOLIDATE_SESSION_SUMMARIES_STAGE_ID,
        body: JSON.stringify(payload),
      });

      return {
        stageId: CONSOLIDATE_SESSION_SUMMARIES_STAGE_ID,
        status: 'success',
        inputCount: 0,
        outputCount: 1,
        artifactIds: [descriptor.id],
      };
    },
  };
};
