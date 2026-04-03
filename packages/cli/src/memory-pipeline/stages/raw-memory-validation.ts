import { parseRawMemoryDocument } from '../markdown/raw-memory-parser.js';
import type {
  ModelProcessor,
  ModelProcessorMetadata,
  ModelProcessorProcessOptions,
  ModelProcessorResult,
} from '../processors/model-processor.js';

const RAW_OUTPUT_RETRY_LIMIT = 1;
const NO_MEMORIES_MARKER = '{"items":[]}';

export interface RawMemoryValidationResult {
  outputs: string[];
  metadata?: ModelProcessorMetadata;
}

export async function processRawMemoryWithValidation(
  processor: ModelProcessor,
  prompt: string,
  options?: ModelProcessorProcessOptions,
): Promise<RawMemoryValidationResult> {
  let currentPrompt = prompt;
  let lastResult: ModelProcessorResult | undefined;

  for (let attempt = 0; attempt <= RAW_OUTPUT_RETRY_LIMIT; attempt += 1) {
    const result = await processor.process([currentPrompt], options);
    lastResult = result;

    if (isProcessorFailure(result)) {
      return result;
    }

    const rawPayload = resolveRawPayload(result.outputs);
    const validationError = validateRawPayload(rawPayload);
    if (!validationError) {
      return {
        outputs: [rawPayload],
        metadata: result.metadata,
      };
    }

    if (attempt === RAW_OUTPUT_RETRY_LIMIT) {
      return {
        outputs: [],
        metadata: {
          provider: result.metadata?.provider,
          status: 'error',
          error: validationError.message,
          ...(result.metadata?.diagnostics ? { diagnostics: result.metadata.diagnostics } : {}),
        },
      };
    }

    currentPrompt = buildRawMemoryRetryPrompt(prompt, rawPayload, validationError.message);
  }

  return lastResult ?? { outputs: [] };
}

function resolveRawPayload(outputs: string[]): string {
  const firstOutput = outputs.find((output) => output.trim().length > 0);
  return (firstOutput ?? NO_MEMORIES_MARKER).trim();
}

function validateRawPayload(rawPayload: string): Error | null {
  try {
    parseRawMemoryDocument(rawPayload);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function isProcessorFailure(result: ModelProcessorResult): boolean {
  return (
    result.outputs.length === 0 &&
    (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
  );
}

function buildRawMemoryRetryPrompt(
  originalPrompt: string,
  invalidPayload: string,
  validationError: string,
): string {
  return [
    originalPrompt,
    '## Correction required',
    'Your previous raw memory output was invalid.',
    `Validation error: ${validationError}`,
    'Return the complete corrected JSON payload again.',
    'Return only valid JSON with a top-level "items" array.',
    'Do not return markdown fences, FILE comments, or file path fields.',
    'Previous invalid output:',
    invalidPayload,
  ].join('\n\n');
}
