import type { MemoryPipelineContext, MemoryPipelineStage, PipelineStageResult } from '../types.js';
import type { ModelProcessor } from '@/memory-pipeline';

export const SUMMARIZE_SESSION_BATCH_STAGE_ID = 'summarize-session-batch';

export interface SummarizeSessionBatchStageOptions {
  processor: ModelProcessor;
  sessionContents?: string[];
}

export const createSummarizeSessionBatchStage = (
  options: SummarizeSessionBatchStageOptions
): MemoryPipelineStage => {
  if (!options?.processor || typeof options.processor.process !== 'function') {
    throw new Error('SummarizeSessionBatchStage requires a ModelProcessor capability');
  }

  const { processor, sessionContents = [] } = options;

  return {
    id: SUMMARIZE_SESSION_BATCH_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const result = await processor.process(sessionContents);
      const payload: Record<string, unknown> = {
        runId: context.runId,
        stage: SUMMARIZE_SESSION_BATCH_STAGE_ID,
        items: sessionContents,
        summaries: result.outputs,
      };

      if (result.metadata) {
        payload.metadata = result.metadata;
      }

      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'summary',
        source: SUMMARIZE_SESSION_BATCH_STAGE_ID,
        body: JSON.stringify(payload),
      });

      const failureStatus =
        result.outputs.length === 0 &&
        (result.metadata?.status === 'error' || result.metadata?.status === 'timeout');

      return {
        stageId: SUMMARIZE_SESSION_BATCH_STAGE_ID,
        status: failureStatus ? 'failed' : 'success',
        inputCount: sessionContents.length,
        outputCount: result.outputs.length,
        artifactIds: [descriptor.id],
        ...(failureStatus && typeof result.metadata?.error === 'string'
          ? { error: result.metadata.error }
          : {}),
      };
    },
  };
};
