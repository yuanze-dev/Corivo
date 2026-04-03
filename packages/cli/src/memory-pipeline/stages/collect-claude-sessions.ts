import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import { setCollectedSessions } from '../pipeline-state.js';
import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

export const COLLECT_CLAUDE_SESSIONS_STAGE_ID = 'collect-claude-sessions';

export const createCollectClaudeSessionsStage = (
  sourceOrOptions: ClaudeSessionSource | { source: ClaudeSessionSource },
): MemoryPipelineStage => {
  const source =
    typeof (sourceOrOptions as ClaudeSessionSource)?.collect === 'function'
      ? (sourceOrOptions as ClaudeSessionSource)
      : (sourceOrOptions as { source: ClaudeSessionSource })?.source;

  if (!source || typeof source.collect !== 'function') {
    throw new Error('ClaudeSessionSource is required');
  }

  return {
    id: COLLECT_CLAUDE_SESSIONS_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const workItems = await source.collect();
      for (const workItem of workItems) {
        if (workItem.metadata?.session?.kind !== 'claude-session') {
          throw new Error('CollectClaudeSessionsStage only accepts claude-session work items');
        }
      }
      setCollectedSessions(context.state, workItems);

      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'work-item',
        source: COLLECT_CLAUDE_SESSIONS_STAGE_ID,
        body: JSON.stringify(workItems),
      });

      return {
        stageId: COLLECT_CLAUDE_SESSIONS_STAGE_ID,
        status: 'success',
        inputCount: workItems.length,
        outputCount: workItems.length,
        artifactIds: [descriptor.id],
      };
    },
  };
};
