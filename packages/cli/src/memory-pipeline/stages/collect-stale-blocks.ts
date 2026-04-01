import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import type { BlockWorkItem } from '../sources/stale-block-source.js';

const STAGE_ID = 'collect-stale-blocks';

export interface StaleBlockSource {
  collect(): Promise<BlockWorkItem[]>;
}

export class CollectStaleBlocksStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  constructor(private readonly source: StaleBlockSource) {
    if (!source || typeof source.collect !== 'function') {
      throw new Error('StaleBlockSource is required');
    }
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const blocks = await this.source.collect();
    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'work-item',
      source: this.id,
      body: JSON.stringify(blocks),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: blocks.length,
      outputCount: blocks.length,
      artifactIds: [descriptor.id],
    };
  }
}
