import type { ClaudeSessionSource } from '../sources/claude-session-source.js';
import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'collect-claude-sessions';

export class CollectClaudeSessionsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  constructor(private readonly source: ClaudeSessionSource) {
    if (!source || typeof source.collect !== 'function') {
      throw new Error('ClaudeSessionSource is required');
    }
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const workItems = await this.source.collect();
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
