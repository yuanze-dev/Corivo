import { createAppendDetailRecordsStage } from '../stages/append-detail-records.js';
import { createCollectClaudeSessionsStage } from '../stages/collect-claude-sessions.js';
import { createConsolidateSessionSummariesStage } from '../stages/consolidate-session-summaries.js';
import { createExtractRawMemoriesStage } from '../stages/extract-raw-memories.js';
import { MergeFinalMemoriesStage } from '../stages/merge-final-memories.js';
import { createRebuildMemoryIndexStage } from '../stages/rebuild-memory-index.js';
import { createSummarizeSessionBatchStage } from '../stages/summarize-session-batch.js';
import { ExtractionBackedModelProcessor, type ModelProcessor } from '../processors/model-processor.js';
import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import type { MemoryPipelineDefinition } from '../types.js';
import type { ExtractionProvider } from '@/infrastructure/llm/types.js';

export interface InitMemoryPipelineOptions {
  sessionSource: ClaudeSessionSource;
  provider?: ExtractionProvider;
  rawExtractionProcessor?: ModelProcessor;
  finalMergeProcessor?: ModelProcessor;
  sessionSummaryProcessor?: ModelProcessor;
}

export const createInitMemoryPipeline = ({
  sessionSource,
  provider = 'claude',
  rawExtractionProcessor = new ExtractionBackedModelProcessor({ provider }),
  finalMergeProcessor = new ExtractionBackedModelProcessor({ provider }),
  sessionSummaryProcessor = new ExtractionBackedModelProcessor({ provider }),
}: InitMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!sessionSource) {
    throw new Error('ClaudeSessionSource is required to build init memory pipeline');
  }

  return {
    id: 'init-memory-pipeline',
    stages: [
      createCollectClaudeSessionsStage({ source: sessionSource }),
      createExtractRawMemoriesStage({ processor: rawExtractionProcessor }),
      new MergeFinalMemoriesStage({ processor: finalMergeProcessor }),
      createSummarizeSessionBatchStage({ processor: sessionSummaryProcessor }),
      createConsolidateSessionSummariesStage(),
      createAppendDetailRecordsStage(),
      createRebuildMemoryIndexStage(),
    ],
  };
};
