import { AppendDetailRecordsStage } from '../stages/append-detail-records.js';
import { CollectClaudeSessionsStage } from '../stages/collect-claude-sessions.js';
import { ConsolidateSessionSummariesStage } from '../stages/consolidate-session-summaries.js';
import { RebuildMemoryIndexStage } from '../stages/rebuild-memory-index.js';
import { SummarizeSessionBatchStage } from '../stages/summarize-session-batch.js';
import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import type { MemoryPipelineDefinition } from '../types.js';

export interface InitMemoryPipelineOptions {
  sessionSource: ClaudeSessionSource;
}

export const createInitMemoryPipeline = ({
  sessionSource,
}: InitMemoryPipelineOptions): MemoryPipelineDefinition => {
  if (!sessionSource) {
    throw new Error('ClaudeSessionSource is required to build init memory pipeline');
  }

  return {
    id: 'init-memory-pipeline',
    stages: [
      new CollectClaudeSessionsStage(sessionSource),
      new SummarizeSessionBatchStage(),
      new ConsolidateSessionSummariesStage(),
      new AppendDetailRecordsStage(),
      new RebuildMemoryIndexStage(),
    ],
  };
};
