import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { getClaimedRawSessionJobs } from '../pipeline-state.js';
import { buildRawExtractionPrompt } from '../prompts/raw-extraction-prompt.js';
import type {
  ModelProcessor,
  ModelProcessorMetadata,
  ModelProcessorProcessOptions,
} from '../processors/model-processor.js';

const STAGE_ID = 'summarize-block-batch';
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

export class SummarizeBlockBatchStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;
  private readonly blockContents: string[];
  private readonly promptBuilder: (input: { sessionFilename: string; sessionTranscript: string }) => string;

  constructor(options: SummarizeBlockBatchStageOptions) {
    if (!options?.processor || typeof options.processor.process !== 'function') {
      throw new Error('SummarizeBlockBatchStage requires a ModelProcessor capability');
    }
    this.processor = options.processor;
    this.blockContents = options.blockContents ?? [];
    this.promptBuilder = options.promptBuilder ?? buildRawExtractionPrompt;
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const transcriptDerived = this.blockContents.length === 0;
    const inputs =
      this.blockContents.length > 0
        ? this.blockContents
        : getClaimedRawSessionJobs(context.state).map((item) =>
            item.transcript.map((message) => `${message.role}: ${message.content}`).join('\n'),
          );
    const result =
      this.blockContents.length > 0
        ? await this.processor.process(inputs)
        : await this.processTranscriptInputs(context, inputs);
    const payload: Record<string, unknown> = {
      runId: context.runId,
      stage: this.id,
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
              sessionId: claimedJobs[index]?.session.externalSessionId ?? claimedJobs[index]?.sessionKey ?? `session-${index + 1}`,
              markdown,
            }),
          }),
        ),
      );
      artifactIds.push(...rawDescriptors.map((descriptor) => descriptor.id));
    }

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'summary',
      source: this.id,
      body: JSON.stringify(payload),
    });
    artifactIds.push(descriptor.id);

    const failureStatus = transcriptDerived
      ? result.outputs.length !== inputs.length ||
        result.metadata?.status === 'error' ||
        result.metadata?.status === 'timeout'
      : result.outputs.length === 0 &&
        (result.metadata?.status === 'error' || result.metadata?.status === 'timeout');

    return {
      stageId: STAGE_ID,
      status: failureStatus ? 'failed' : 'success',
      inputCount: inputs.length,
      outputCount: result.outputs.length,
      artifactIds,
      ...(failureStatus && typeof result.metadata?.error === 'string'
        ? { error: result.metadata.error }
        : {}),
    };
  }

  private async processTranscriptInputs(
    context: MemoryPipelineContext,
    inputs: string[],
  ): Promise<{
    outputs: string[];
    metadata?: Record<string, unknown>;
  }> {
    const outputs: string[] = [];
    const metadataByInput: ModelProcessorMetadata[] = [];
    const claimedJobs = getClaimedRawSessionJobs(context.state);

    for (const [index, input] of inputs.entries()) {
      const job = claimedJobs[index];
      const prompt = job
        ? this.promptBuilder({
            sessionFilename: `${job.session.externalSessionId}.md`,
            sessionTranscript: input,
          })
        : input;
      const result = await this.processor.process(
        [prompt],
        this.buildTranscriptProcessOptions(job?.transcript ?? []),
      );
      if (result.metadata) {
        metadataByInput.push(result.metadata);
      }

      const failed =
        result.outputs.length !== 1 ||
        result.metadata?.status === 'error' ||
        result.metadata?.status === 'timeout';

      if (failed) {
        const providerError =
          typeof result.metadata?.error === 'string' ? result.metadata.error : undefined;

        return {
          outputs,
          metadata: {
            ...(metadataByInput.length <= 1
              ? (metadataByInput[0] ?? {})
              : { items: metadataByInput }),
            status: 'error',
            error: providerError ?? 'raw session summarization did not return one output per job',
          },
        };
      }

      outputs.push(result.outputs[0]);
      inputs[index] = prompt;
    }

    const metadata: Record<string, unknown> | undefined =
      metadataByInput.length === 0
        ? undefined
        : metadataByInput.every(
            (item) => JSON.stringify(item) === JSON.stringify(metadataByInput[0]),
          )
        ? { ...metadataByInput[0] }
        : { items: metadataByInput };

    return { outputs, metadata };
  }

  private buildTranscriptProcessOptions(
    transcript: Array<{ role: string; content: string }>,
  ): ModelProcessorProcessOptions {
    const messageCount = transcript.length;
    const charCount = transcript.reduce((total, message) => total + message.content.length, 0);
    const hasLongAssistantMessage = transcript.some(
      (message) =>
        message.role === 'assistant' && message.content.length > LONG_ASSISTANT_MESSAGE_THRESHOLD,
    );
    const timeoutMs = Math.min(
      MAX_TIMEOUT_MS,
      BASE_TIMEOUT_MS
        + messageCount * PER_MESSAGE_TIMEOUT_MS
        + Math.ceil(charCount / 1_000) * PER_1000_CHARS_TIMEOUT_MS
        + (hasLongAssistantMessage ? LONG_ASSISTANT_MESSAGE_BONUS_MS : 0),
    );

    return { timeoutMs };
  }
}
