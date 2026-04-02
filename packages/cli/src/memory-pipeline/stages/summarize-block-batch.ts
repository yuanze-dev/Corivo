import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { getRawSessionJobs } from '../pipeline-state.js';
import type { ModelProcessor, ModelProcessorMetadata } from '../processors/model-processor.js';
import { ExtractionBackedModelProcessor } from '../processors/model-processor.js';
import type { ExtractionProvider } from '../../extraction/types.js';

const STAGE_ID = 'summarize-block-batch';

export interface SummarizeBlockBatchStageOptions {
  processor?: ModelProcessor;
  blockContents?: string[];
  provider?: ExtractionProvider;
}

export class SummarizeBlockBatchStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;
  private readonly blockContents: string[];

  constructor(options: SummarizeBlockBatchStageOptions = {}) {
    this.processor =
      options.processor ?? new ExtractionBackedModelProcessor({ provider: options.provider ?? 'claude' });
    this.blockContents = options.blockContents ?? [];
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const transcriptDerived = this.blockContents.length === 0;
    const inputs =
      this.blockContents.length > 0
        ? this.blockContents
        : getRawSessionJobs(context.state).map((item) =>
            item.transcript.map((message) => `${message.role}: ${message.content}`).join('\n'),
          );
    const result =
      this.blockContents.length > 0
        ? await this.processor.process(inputs)
        : await this.processTranscriptInputs(inputs);
    const payload: Record<string, unknown> = {
      runId: context.runId,
      stage: this.id,
      blocks: inputs,
      summaries: result.outputs,
    };

    if (result.metadata) {
      payload.metadata = result.metadata;
    }

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'summary',
      source: this.id,
      body: JSON.stringify(payload),
    });

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
      artifactIds: [descriptor.id],
      ...(failureStatus && typeof result.metadata?.error === 'string'
        ? { error: result.metadata.error }
        : {}),
    };
  }

  private async processTranscriptInputs(inputs: string[]): Promise<{
    outputs: string[];
    metadata?: Record<string, unknown>;
  }> {
    const outputs: string[] = [];
    const metadataByInput: ModelProcessorMetadata[] = [];

    for (const input of inputs) {
      const result = await this.processor.process([input]);
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
}
