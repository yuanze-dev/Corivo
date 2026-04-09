import { createAppendDetailRecordsStage } from '../stages/append-detail-records.js';
import { type RawSessionJobSource } from '../sources/raw-session-job-source.js';
import { CompleteRawSessionJobsStage } from '../stages/complete-raw-session-jobs.js';
import { createCollectRawSessionJobsStage } from '../stages/collect-raw-session-jobs.js';
import { MergeFinalMemoriesStage } from '../stages/merge-final-memories.js';
import { createRefreshMemoryIndexStage } from '../stages/refresh-memory-index.js';
import { createSummarizeBlockBatchStage } from '../stages/summarize-block-batch.js';
import { createSyncProviderMemoriesStage } from '../stages/sync-provider-memories.js';
import { ExtractionBackedModelProcessor, type ModelProcessor } from '../processors/model-processor.js';
import type { MemoryPipelineDefinition } from '../types.js';
import type { ExtractionProvider } from '@/infrastructure/llm/types.js';
import type { MemoryProvider } from '@/domain/memory/providers/types.js';

export interface ScheduledMemoryPipelineOptions {
  rawSessionJobSource: RawSessionJobSource;
  provider?: ExtractionProvider;
  blockSummaryProcessor?: ModelProcessor;
  finalMergeProcessor?: ModelProcessor;
  memoryProvider?: MemoryProvider;
  projectTag?: string;
}

export const createScheduledMemoryPipeline = ({
  rawSessionJobSource,
  provider = 'claude',
  blockSummaryProcessor = new ExtractionBackedModelProcessor({ provider }),
  finalMergeProcessor = new ExtractionBackedModelProcessor({ provider }),
  memoryProvider,
  projectTag,
}: ScheduledMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!rawSessionJobSource) {
    throw new Error('RawSessionJobSource is required to build scheduled memory pipeline');
  }

  const stages = [
    createCollectRawSessionJobsStage({
      source: rawSessionJobSource,
      jobCompletionHook: rawSessionJobSource,
    }),
    createSummarizeBlockBatchStage({ processor: blockSummaryProcessor }),
    new MergeFinalMemoriesStage({ processor: finalMergeProcessor }),
    createAppendDetailRecordsStage(),
    createRefreshMemoryIndexStage(),
  ];

  if (memoryProvider && projectTag) {
    stages.push(
      createSyncProviderMemoriesStage({
        provider: memoryProvider,
        projectTag,
      }),
    );
  }

  stages.push(
    new CompleteRawSessionJobsStage({
      jobCompletionHook: rawSessionJobSource,
    }),
  );

  return {
    id: 'scheduled-memory-pipeline',
    stages,
  };
};
