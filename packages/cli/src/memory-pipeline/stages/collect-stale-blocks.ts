import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import type { BlockWorkItem } from '../sources/stale-block-source.js';

export const COLLECT_STALE_BLOCKS_STAGE_ID = 'collect-stale-blocks';

export interface StaleBlockSource {
  collect(): Promise<BlockWorkItem[]>;
}

export const createCollectStaleBlocksStage = (source: StaleBlockSource): MemoryPipelineStage => {
  if (!source || typeof source.collect !== 'function') {
    throw new Error('StaleBlockSource is required');
  }

  return {
    id: COLLECT_STALE_BLOCKS_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const blocks = await source.collect();
      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'work-item',
        source: COLLECT_STALE_BLOCKS_STAGE_ID,
        body: JSON.stringify(blocks),
      });

      return {
        stageId: COLLECT_STALE_BLOCKS_STAGE_ID,
        status: 'success',
        inputCount: blocks.length,
        outputCount: blocks.length,
        artifactIds: [descriptor.id],
      };
    },
  };
};
