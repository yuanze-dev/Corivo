import { AppendDetailRecordsStage } from '../stages/append-detail-records.js';
import { type RawSessionJobSource } from '../sources/raw-session-job-source.js';
import { CompleteRawSessionJobsStage } from '../stages/complete-raw-session-jobs.js';
import { CollectRawSessionJobsStage } from '../stages/collect-raw-session-jobs.js';
import { RefreshMemoryIndexStage } from '../stages/refresh-memory-index.js';
import { SummarizeBlockBatchStage } from '../stages/summarize-block-batch.js';
import type { MemoryPipelineDefinition } from '../types.js';
import type { ExtractionProvider } from '../../extraction/types.js';

export interface ScheduledMemoryPipelineOptions {
  rawSessionJobSource: RawSessionJobSource;
  provider?: ExtractionProvider;
}

export const createScheduledMemoryPipeline = ({
  rawSessionJobSource,
  provider = 'claude',
}: ScheduledMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!rawSessionJobSource) {
    throw new Error('RawSessionJobSource is required to build scheduled memory pipeline');
  }

  return {
    id: 'scheduled-memory-pipeline',
    stages: [
      new CollectRawSessionJobsStage(rawSessionJobSource),
      new SummarizeBlockBatchStage({ provider }),
      new AppendDetailRecordsStage(),
      new RefreshMemoryIndexStage(),
      new CompleteRawSessionJobsStage(),
    ],
  };
};
