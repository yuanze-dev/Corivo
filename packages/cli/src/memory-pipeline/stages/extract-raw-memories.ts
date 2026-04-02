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
const INVALID_SESSION_PAYLOAD_ERROR =
  'ExtractRawMemoriesStage requires a valid session payload with at least one usable message';

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
    const failures: string[] = [];

    for (const artifact of collectedArtifacts) {
      const workItems = await this.readSessionWorkItems(context, artifact);
      for (const workItem of workItems) {
        inputCount += 1;
        const session = this.getValidatedSession(workItem);
        const prompt = buildRawExtractionPrompt({
          sessionFilename: `${session.sessionId}.md`,
          sessionTranscript: this.renderSessionTranscript(session),
        });
        const result = await this.processor.process([prompt]);
        const failure = this.getProcessorFailure(result);
        if (failure) {
          failures.push(failure);
          continue;
        }
        const markdown = this.resolveMarkdown(result.outputs);
        const descriptor = await context.artifactStore.writeArtifact({
          runId: context.runId,
          kind: 'raw-memory-batch',
          source: this.id,
          upstreamIds: [artifact.id],
          body: JSON.stringify({
            sessionId: session.sessionId,
            markdown,
          }),
        });
        artifactIds.push(descriptor.id);
      }
    }

    const status =
      failures.length === 0 ? 'success' : artifactIds.length === 0 ? 'failed' : 'partial';

    return {
      stageId: this.id,
      status,
      inputCount,
      outputCount: artifactIds.length,
      artifactIds,
      ...(failures.length > 0 ? { error: failures.join('; ') } : {}),
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

  private renderSessionTranscript(session: SessionRecord): string {
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

  private getValidatedSession(workItem: SessionWorkItem): SessionRecord {
    const session = workItem.metadata?.session;
    if (!session || typeof session.sessionId !== 'string' || session.sessionId.trim().length === 0) {
      throw new Error(INVALID_SESSION_PAYLOAD_ERROR);
    }

    if (!Array.isArray(session.messages) || session.messages.length === 0) {
      throw new Error(INVALID_SESSION_PAYLOAD_ERROR);
    }

    const hasUsableMessage = session.messages.some(
      (message) =>
        typeof message?.role === 'string' &&
        message.role.trim().length > 0 &&
        typeof message?.content === 'string' &&
        message.content.trim().length > 0,
    );

    if (!hasUsableMessage) {
      throw new Error(INVALID_SESSION_PAYLOAD_ERROR);
    }

    return session;
  }

  private getProcessorFailure(result: Awaited<ReturnType<ModelProcessor['process']>>): string | null {
    if (
      result.outputs.length === 0 &&
      (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
    ) {
      return result.metadata.error ?? `raw extraction ${result.metadata.status}`;
    }

    return null;
  }
}
