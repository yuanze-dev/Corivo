import type { SessionRecord } from '../contracts/session-record.js';
import { parseRawMemoryDocument } from '../markdown/raw-memory-parser.js';
import { buildRawExtractionPrompt } from '../prompts/raw-extraction-prompt.js';
import { recordExtractedRawMemory } from '../pipeline-state.js';
import type { ModelProcessor } from '../processors/model-processor.js';
import { processRawMemoryWithValidation } from './raw-memory-validation.js';
import type {
  ArtifactDescriptor,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
  WorkItem,
} from '../types.js';

export const EXTRACT_RAW_MEMORIES_STAGE_ID = 'extract-raw-memories';
const COLLECT_STAGE_ID = 'collect-claude-sessions';
const INVALID_SESSION_PAYLOAD_ERROR =
  'ExtractRawMemoriesStage requires a valid session payload with at least one usable message';

interface SessionWorkItem extends WorkItem {
  kind: 'session';
  metadata?: {
    session?: SessionRecord;
  };
}

export interface ExtractRawMemoriesStageOptions {
  processor: ModelProcessor;
}

export const createExtractRawMemoriesStage = (
  options: ExtractRawMemoriesStageOptions,
): MemoryPipelineStage => {
  if (!options?.processor || typeof options.processor.process !== 'function') {
    throw new Error('ExtractRawMemoriesStage requires a ModelProcessor capability');
  }

  const processor = options.processor;

  return {
    id: EXTRACT_RAW_MEMORIES_STAGE_ID,
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
        const workItems = await readSessionWorkItems(context, artifact);
        for (const workItem of workItems) {
          inputCount += 1;
          const session = getValidatedSession(workItem);
          const prompt = buildRawExtractionPrompt({
            sessionFilename: `${session.sessionId}.md`,
            sessionTranscript: renderSessionTranscript(session),
          });
          const result = await processRawMemoryWithValidation(processor, prompt);
          const failure = getProcessorFailure(result);
          if (failure) {
            failures.push(failure);
            continue;
          }
          const items = resolveItems(result.outputs);
          const descriptor = await context.artifactStore.writeArtifact({
            runId: context.runId,
            kind: 'raw-memory-batch',
            source: EXTRACT_RAW_MEMORIES_STAGE_ID,
            upstreamIds: [artifact.id],
            body: JSON.stringify({
              sessionId: session.sessionId,
              ...(items.length === 0
                ? { markdown: '<!-- NO_MEMORIES -->' }
                : { items }),
            }),
          });
          recordExtractedRawMemory(context.state, {
            sessionId: session.sessionId,
            artifactId: descriptor.id,
          });
          artifactIds.push(descriptor.id);
        }
      }

      const status =
        failures.length === 0 ? 'success' : artifactIds.length === 0 ? 'failed' : 'partial';

      return {
        stageId: EXTRACT_RAW_MEMORIES_STAGE_ID,
        status,
        inputCount,
        outputCount: artifactIds.length,
        artifactIds,
        ...(failures.length > 0 ? { error: failures.join('; ') } : {}),
      };
    },
  };
};

const readSessionWorkItems = async (
  context: MemoryPipelineContext,
  artifact: ArtifactDescriptor,
): Promise<SessionWorkItem[]> => {
  const body = await context.artifactStore.readArtifact(artifact.id);
  const parsed = JSON.parse(body) as WorkItem[];
  return parsed.filter((item): item is SessionWorkItem => item.kind === 'session');
};

const renderSessionTranscript = (session: SessionRecord): string => {
  return session.messages
    .map((message) => `${normalizeRole(message.role)}: ${message.content}`)
    .join('\n\n');
};

const normalizeRole = (role: string): string => {
  if (!role) {
    return 'Unknown';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
};

const resolveItems = (outputs: string[]) => parseRawMemoryDocument(outputs[0] ?? '{"items":[]}').items;

const getValidatedSession = (workItem: SessionWorkItem): SessionRecord => {
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
};

const getProcessorFailure = (
  result: Awaited<ReturnType<ModelProcessor['process']>>,
): string | null => {
  if (
    result.outputs.length === 0 &&
    (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
  ) {
    return result.metadata.error ?? `raw extraction ${result.metadata.status}`;
  }

  return null;
};
