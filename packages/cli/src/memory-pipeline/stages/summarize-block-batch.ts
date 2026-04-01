import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import type { ModelProcessor } from '../processors/model-processor.js';
import { ExtractionBackedModelProcessor } from '../processors/model-processor.js';

const STAGE_ID = 'summarize-block-batch';

export interface SummarizeBlockBatchStageOptions {
  processor?: ModelProcessor;
  blockContents?: string[];
}

export class SummarizeBlockBatchStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;
  private readonly blockContents: string[];

  constructor(options: SummarizeBlockBatchStageOptions = {}) {
    this.processor =
      options.processor ?? new ExtractionBackedModelProcessor({ provider: 'claude' });
    this.blockContents = options.blockContents ?? [];
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const result = await this.processor.process(this.blockContents);
    const payload: Record<string, unknown> = {
      runId: context.runId,
      stage: this.id,
      blocks: this.blockContents,
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

    const failureStatus =
      result.outputs.length === 0 &&
      (result.metadata?.status === 'error' || result.metadata?.status === 'timeout');

    return {
      stageId: STAGE_ID,
      status: failureStatus ? 'failed' : 'success',
      inputCount: this.blockContents.length,
      outputCount: result.outputs.length,
      artifactIds: [descriptor.id],
      ...(failureStatus && typeof result.metadata?.error === 'string'
        ? { error: result.metadata.error }
        : {}),
    };
  }
}
