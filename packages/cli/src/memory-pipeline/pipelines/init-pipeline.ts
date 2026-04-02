import { AppendDetailRecordsStage } from '../stages/append-detail-records.js';
import { CollectClaudeSessionsStage } from '../stages/collect-claude-sessions.js';
import { ConsolidateSessionSummariesStage } from '../stages/consolidate-session-summaries.js';
import { ExtractRawMemoriesStage } from '../stages/extract-raw-memories.js';
import { MergeFinalMemoriesStage } from '../stages/merge-final-memories.js';
import { RebuildMemoryIndexStage } from '../stages/rebuild-memory-index.js';
import { SummarizeSessionBatchStage } from '../stages/summarize-session-batch.js';
import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import type { MemoryPipelineDefinition } from '../types.js';
import type { ExtractionProvider } from '../../extraction/types.js';

export interface InitMemoryPipelineOptions {
  sessionSource: ClaudeSessionSource;
  provider?: ExtractionProvider;
}

export const createInitMemoryPipeline = ({
  sessionSource,
  provider = 'claude',
}: InitMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!sessionSource) {
    throw new Error('ClaudeSessionSource is required to build init memory pipeline');
  }

  return {
    id: 'init-memory-pipeline',
    stages: [
      new CollectClaudeSessionsStage(sessionSource),
      new ExtractRawMemoriesStage({ provider }),
      new MergeFinalMemoriesStage({ provider }),
      new SummarizeSessionBatchStage({ provider }),
      new ConsolidateSessionSummariesStage(),
      new AppendDetailRecordsStage(),
      new RebuildMemoryIndexStage(),
    ],
  };
};
