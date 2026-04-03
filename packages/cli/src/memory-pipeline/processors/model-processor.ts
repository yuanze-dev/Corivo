import type {
  ExtractionInput,
  ExtractionProvider,
  ExtractionResult,
} from '@/infrastructure/llm/types.js';
import { extractWithProvider } from '@/infrastructure/llm/index.js';

export interface ModelProcessorMetadata {
  provider?: ExtractionProvider;
  status: 'success' | 'error' | 'timeout';
  error?: string;
}

export interface ModelProcessorResult {
  outputs: string[];
  metadata?: ModelProcessorMetadata;
}

export interface ModelProcessorProcessOptions {
  timeoutMs?: number;
}

export interface ModelProcessor {
  process(inputs: string[], options?: ModelProcessorProcessOptions): Promise<ModelProcessorResult>;
}

export class NoopModelProcessor implements ModelProcessor {
  async process(inputs: string[]) {
    return {
      outputs: inputs,
    };
  }
}

export interface ExtractionBackedModelProcessorOptions {
  provider: ExtractionProvider;
  timeoutMs?: number;
  extract?: (input: ExtractionInput) => Promise<ExtractionResult>;
}

export class ExtractionBackedModelProcessor implements ModelProcessor {
  private readonly extractor: (input: ExtractionInput) => Promise<ExtractionResult>;

  constructor(private readonly options: ExtractionBackedModelProcessorOptions) {
    if (!options?.provider) {
      throw new Error('provider is required');
    }

    this.extractor = options.extract ?? extractWithProvider;
  }

  async process(inputs: string[], processOptions: ModelProcessorProcessOptions = {}): Promise<ModelProcessorResult> {
    if (!inputs?.length) {
      return { outputs: [] };
    }

    const prompt = inputs.length === 1 ? inputs[0] : inputs;

    try {
      const extraction = await this.extractor({
        provider: this.options.provider,
        prompt,
        timeoutMs: processOptions.timeoutMs ?? this.options.timeoutMs,
      });

      if (extraction.status === 'success' && extraction.result !== null) {
        return {
          outputs: [extraction.result],
          metadata: {
            provider: extraction.provider,
            status: extraction.status,
          },
        };
      }

      const metadata: ModelProcessorMetadata = {
        provider: extraction.provider,
        status: extraction.status,
      };

      if (extraction.error) {
        metadata.error = extraction.error;
      }

      return { outputs: [], metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outputs: [],
        metadata: {
          provider: this.options.provider,
          status: 'error' as const,
          error: message,
        },
      };
    }
  }
}
