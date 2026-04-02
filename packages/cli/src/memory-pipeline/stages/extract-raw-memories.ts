import type { SessionRecord } from '../contracts/session-record.js';
import { buildRawExtractionPrompt } from '../prompts/raw-extraction-prompt.js';
import type { ModelProcessor } from '../processors/model-processor.js';
import { ExtractionBackedModelProcessor } from '../processors/model-processor.js';
import type {
  ArtifactDescriptor,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
  WorkItem,
} from '../types.js';

const STAGE_ID = 'extract-raw-memories';
const COLLECT_STAGE_ID = 'collect-claude-sessions';
const NO_MEMORIES_MARKER = '<!-- NO_MEMORIES -->';

interface SessionWorkItem extends WorkItem {
  kind: 'session';
  metadata?: {
    session?: SessionRecord;
  };
}

export interface ExtractRawMemoriesStageOptions {
  processor?: ModelProcessor;
}

export class ExtractRawMemoriesStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;

  constructor(options: ExtractRawMemoriesStageOptions = {}) {
    this.processor = options.processor ?? new ExtractionBackedModelProcessor({ provider: 'claude' });
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const collectedArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      kind: 'work-item',
      source: COLLECT_STAGE_ID,
    });

    const artifactIds: string[] = [];
    let inputCount = 0;

    for (const artifact of collectedArtifacts) {
      const workItems = await this.readSessionWorkItems(context, artifact);
      for (const workItem of workItems) {
        inputCount += 1;
        const prompt = buildRawExtractionPrompt({
          sessionFilename: `${workItem.metadata?.session?.sessionId ?? workItem.id}.md`,
          sessionTranscript: this.renderSessionTranscript(workItem.metadata?.session),
        });
        const result = await this.processor.process([prompt]);
        const markdown = this.resolveMarkdown(result.outputs);
        const descriptor = await context.artifactStore.writeArtifact({
          runId: context.runId,
          kind: 'raw-memory-batch',
          source: this.id,
          upstreamIds: [artifact.id],
          body: JSON.stringify({
            sessionId: workItem.metadata?.session?.sessionId ?? workItem.id,
            markdown,
          }),
        });
        artifactIds.push(descriptor.id);
      }
    }

    return {
      stageId: this.id,
      status: 'success',
      inputCount,
      outputCount: artifactIds.length,
      artifactIds,
    };
  }

  private async readSessionWorkItems(
    context: MemoryPipelineContext,
    artifact: ArtifactDescriptor,
  ): Promise<SessionWorkItem[]> {
    const body = await context.artifactStore.readArtifact(artifact.id);
    const parsed = JSON.parse(body) as WorkItem[];
    return parsed.filter((item): item is SessionWorkItem => item.kind === 'session');
  }

  private renderSessionTranscript(session?: SessionRecord): string {
    if (!session?.messages?.length) {
      return '';
    }

    return session.messages
      .map((message) => `${this.normalizeRole(message.role)}: ${message.content}`)
      .join('\n\n');
  }

  private normalizeRole(role: string): string {
    if (!role) {
      return 'Unknown';
    }

    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private resolveMarkdown(outputs: string[]): string {
    const firstOutput = outputs.find((output) => output.trim().length > 0);
    return firstOutput ?? NO_MEMORIES_MARKER;
  }
}
