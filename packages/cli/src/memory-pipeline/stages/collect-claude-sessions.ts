import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import { setCollectedSessions } from '../pipeline-state.js';
import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'collect-claude-sessions';

export class CollectClaudeSessionsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly source: ClaudeSessionSource;

  constructor(sourceOrOptions: ClaudeSessionSource | { source: ClaudeSessionSource }) {
    this.source =
      typeof (sourceOrOptions as ClaudeSessionSource)?.collect === 'function'
        ? (sourceOrOptions as ClaudeSessionSource)
        : (sourceOrOptions as { source: ClaudeSessionSource })?.source;

    const source = this.source;
    if (!source || typeof source.collect !== 'function') {
      throw new Error('ClaudeSessionSource is required');
    }
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const workItems = await this.source.collect();
    for (const workItem of workItems) {
      if (workItem.metadata?.session?.kind !== 'claude-session') {
        throw new Error('CollectClaudeSessionsStage only accepts claude-session work items');
      }
    }
    setCollectedSessions(context.state, workItems);

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'work-item',
      source: this.id,
      body: JSON.stringify(workItems),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: workItems.length,
      outputCount: workItems.length,
      artifactIds: [descriptor.id],
    };
  }
}
