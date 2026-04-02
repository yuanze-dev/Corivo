import type {
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import type { ModelProcessor } from '../processors/model-processor.js';
import { ExtractionBackedModelProcessor } from '../processors/model-processor.js';
import type { ExtractionProvider } from '../../extraction/types.js';

const STAGE_ID = 'summarize-session-batch';

export interface SummarizeSessionBatchStageOptions {
  processor?: ModelProcessor;
  sessionContents?: string[];
  provider?: ExtractionProvider;
}

export class SummarizeSessionBatchStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;
  private readonly sessionContents: string[];

  constructor(options: SummarizeSessionBatchStageOptions = {}) {
    this.processor = options.processor ?? new ExtractionBackedModelProcessor({ provider: options.provider ?? 'claude' });
    this.sessionContents = options.sessionContents ?? [];
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const result = await this.processor.process(this.sessionContents);
    const payload: Record<string, unknown> = {
      runId: context.runId,
      stage: this.id,
      items: this.sessionContents,
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
      inputCount: this.sessionContents.length,
      outputCount: result.outputs.length,
      artifactIds: [descriptor.id],
      ...(failureStatus && typeof result.metadata?.error === 'string'
        ? { error: result.metadata.error }
        : {}),
    };
  }
}
