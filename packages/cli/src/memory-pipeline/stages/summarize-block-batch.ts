import type { MemoryPipelineContext, MemoryPipelineStage, PipelineStageResult } from '../types.js';
import { getClaimedRawSessionJobs } from '../pipeline-state.js';
import { buildRawExtractionPrompt } from '../prompts/raw-extraction-prompt.js';
import type {
  ModelProcessor,
  ModelProcessorMetadata,
  ModelProcessorProcessOptions,
} from '../processors/model-processor.js';
import { processRawMemoryWithValidation } from './raw-memory-validation.js';

export const SUMMARIZE_BLOCK_BATCH_STAGE_ID = 'summarize-block-batch';

const BASE_TIMEOUT_MS = 30_000;
const PER_MESSAGE_TIMEOUT_MS = 1_500;
const PER_1000_CHARS_TIMEOUT_MS = 3_000;
const LONG_ASSISTANT_MESSAGE_THRESHOLD = 4_000;
const LONG_ASSISTANT_MESSAGE_BONUS_MS = 20_000;
const MAX_TIMEOUT_MS = 300_000;
const RAW_MEMORY_ARTIFACT_SOURCE = 'extract-raw-memories';

export interface SummarizeBlockBatchStageOptions {
  processor: ModelProcessor;
  blockContents?: string[];
  promptBuilder?: (input: { sessionFilename: string; sessionTranscript: string }) => string;
}

interface TranscriptFailureRecord {
  index: number;
  sessionId: string;
  provider?: string;
  status: 'error' | 'timeout';
  error: string;
  diagnostics?: ModelProcessorMetadata['diagnostics'];
}

export const createSummarizeBlockBatchStage = (
  options: SummarizeBlockBatchStageOptions,
): MemoryPipelineStage => {
  if (!options?.processor || typeof options.processor.process !== 'function') {
    throw new Error('SummarizeBlockBatchStage requires a ModelProcessor capability');
  }

  const processor = options.processor;
  const blockContents = options.blockContents ?? [];
  const promptBuilder = options.promptBuilder ?? buildRawExtractionPrompt;

  return {
    id: SUMMARIZE_BLOCK_BATCH_STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const transcriptDerived = blockContents.length === 0;
      const inputs =
        blockContents.length > 0
          ? [...blockContents]
          : getClaimedRawSessionJobs(context.state).map((item) =>
              item.transcript.map((message) => `${message.role}: ${message.content}`).join('\n')
            );
      const result =
        blockContents.length > 0
          ? await processor.process(inputs)
          : await processTranscriptInputs(context, inputs, processor, promptBuilder);
      const outputIndexes = result.outputIndexes ?? [];
      const failures = result.failures ?? [];
      const payload: Record<string, unknown> = {
        runId: context.runId,
        stage: SUMMARIZE_BLOCK_BATCH_STAGE_ID,
        blocks: inputs,
        summaries: result.outputs,
      };

      if (result.metadata) {
        payload.metadata = result.metadata;
      }

      const artifactIds: string[] = [];
      if (transcriptDerived) {
        const claimedJobs = getClaimedRawSessionJobs(context.state);
        const rawDescriptors = await Promise.all(
          result.outputs.map((markdown, index) =>
            context.artifactStore.writeArtifact({
              runId: context.runId,
              kind: 'raw-memory-batch',
              source: RAW_MEMORY_ARTIFACT_SOURCE,
              body: JSON.stringify({
                sessionId:
                  claimedJobs[outputIndexes[index] ?? index]?.session.externalSessionId ??
                  claimedJobs[outputIndexes[index] ?? index]?.sessionKey ??
                  `session-${(outputIndexes[index] ?? index) + 1}`,
                markdown,
              }),
            })
          )
        );
        artifactIds.push(...rawDescriptors.map((descriptor) => descriptor.id));
      }

      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'summary',
        source: SUMMARIZE_BLOCK_BATCH_STAGE_ID,
        body: JSON.stringify(payload),
      });
      artifactIds.push(descriptor.id);

      const transcriptFailures = transcriptDerived ? failures.length : 0;
      const failedAllTranscriptInputs = transcriptDerived && result.outputs.length === 0 && inputs.length > 0;
      const failureStatus = transcriptDerived
        ? failedAllTranscriptInputs
          ? 'failed'
          : transcriptFailures > 0
            ? 'partial'
            : 'success'
        : result.outputs.length === 0 &&
            (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
          ? 'failed'
          : 'success';

      return {
        stageId: SUMMARIZE_BLOCK_BATCH_STAGE_ID,
        status: failureStatus,
        inputCount: inputs.length,
        outputCount: result.outputs.length,
        artifactIds,
        ...(failureStatus !== 'success'
          ? {
              error:
                transcriptDerived && failures.length > 0
                  ? failures
                      .map((failure) => `[${failure.sessionId}] ${failure.error}`)
                      .join('; ')
                  : typeof result.metadata?.error === 'string'
                    ? result.metadata.error
                    : undefined,
            }
          : {}),
      };
    },
  };
};

const processTranscriptInputs = async (
  context: MemoryPipelineContext,
  inputs: string[],
  processor: ModelProcessor,
  promptBuilder: (input: { sessionFilename: string; sessionTranscript: string }) => string,
): Promise<{
  outputs: string[];
  outputIndexes: number[];
  metadata?: Record<string, unknown>;
  failures: TranscriptFailureRecord[];
}> => {
  const outputs: string[] = [];
  const outputIndexes: number[] = [];
  const metadataByInput: ModelProcessorMetadata[] = [];
  const failures: TranscriptFailureRecord[] = [];
  const claimedJobs = getClaimedRawSessionJobs(context.state);

  for (const [index, input] of inputs.entries()) {
    const job = claimedJobs[index];
    const sessionId = job?.session.externalSessionId ?? job?.sessionKey ?? `session-${index + 1}`;
    const prompt = job
      ? promptBuilder({
          sessionFilename: `${job.session.externalSessionId}.md`,
          sessionTranscript: input,
        })
      : input;
    const result = await processRawMemoryWithValidation(
      processor,
      prompt,
      buildTranscriptProcessOptions(job?.transcript ?? []),
    );
    if (result.metadata) {
      metadataByInput.push(result.metadata);
    }

    const failed =
      result.outputs.length !== 1 ||
      result.metadata?.status === 'error' ||
      result.metadata?.status === 'timeout';

    if (failed) {
      failures.push({
        index,
        sessionId,
        provider: result.metadata?.provider,
        status:
          result.metadata?.status === 'timeout'
            ? 'timeout'
            : 'error',
        error:
          typeof result.metadata?.error === 'string'
            ? result.metadata.error
            : 'raw session summarization did not return one output per job',
        ...(result.metadata?.diagnostics ? { diagnostics: result.metadata.diagnostics } : {}),
      });
      inputs[index] = prompt;
      continue;
    }

    outputs.push(result.outputs[0]);
    outputIndexes.push(index);
    inputs[index] = prompt;
  }

  const metadata: Record<string, unknown> | undefined =
    metadataByInput.length === 0
      ? undefined
      : failures.length === 0 &&
          metadataByInput.every(
            (item) => JSON.stringify(item) === JSON.stringify(metadataByInput[0]),
          )
        ? { ...metadataByInput[0] }
        : {
            items: metadataByInput,
            ...(failures.length > 0 ? { failures } : {}),
          };

  return { outputs, outputIndexes, metadata, failures };
};

const buildTranscriptProcessOptions = (
  transcript: Array<{ role: string; content: string }>,
): ModelProcessorProcessOptions => {
  const messageCount = transcript.length;
  const charCount = transcript.reduce((total, message) => total + message.content.length, 0);
  const hasLongAssistantMessage = transcript.some(
    (message) =>
      message.role === 'assistant' && message.content.length > LONG_ASSISTANT_MESSAGE_THRESHOLD,
  );
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    BASE_TIMEOUT_MS +
      messageCount * PER_MESSAGE_TIMEOUT_MS +
      Math.ceil(charCount / 1_000) * PER_1000_CHARS_TIMEOUT_MS +
      (hasLongAssistantMessage ? LONG_ASSISTANT_MESSAGE_BONUS_MS : 0),
  );

  return { timeoutMs };
};
