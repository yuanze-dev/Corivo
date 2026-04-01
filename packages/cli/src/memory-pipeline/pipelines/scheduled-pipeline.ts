import { AppendDetailRecordsStage } from '../stages/append-detail-records.js';
import {
  CollectStaleBlocksStage,
  type StaleBlockSource,
} from '../stages/collect-stale-blocks.js';
import { RefreshMemoryIndexStage } from '../stages/refresh-memory-index.js';
import { SummarizeBlockBatchStage } from '../stages/summarize-block-batch.js';
import type { MemoryPipelineDefinition } from '../types.js';

export interface ScheduledMemoryPipelineOptions {
  staleBlockSource: StaleBlockSource;
}

export const createScheduledMemoryPipeline = ({
  staleBlockSource,
}: ScheduledMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!staleBlockSource) {
    throw new Error('StaleBlockSource is required to build scheduled memory pipeline');
  }

  return {
    id: 'scheduled-memory-pipeline',
    stages: [
      new CollectStaleBlocksStage(staleBlockSource),
      new SummarizeBlockBatchStage(),
      new AppendDetailRecordsStage(),
      new RefreshMemoryIndexStage(),
    ],
  };
};
