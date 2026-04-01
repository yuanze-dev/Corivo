import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'append-detail-records';

export class AppendDetailRecordsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'detail-record',
      source: this.id,
      body: '[]',
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
