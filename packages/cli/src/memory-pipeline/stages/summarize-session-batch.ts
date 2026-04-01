import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'summarize-session-batch';

export class SummarizeSessionBatchStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const payload = {
      runId: context.runId,
      stage: this.id,
      items: [],
    };

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'summary',
      source: this.id,
      body: JSON.stringify(payload),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: 0,
      outputCount: 1,
      artifactIds: [descriptor.id],
    };
  }
}
