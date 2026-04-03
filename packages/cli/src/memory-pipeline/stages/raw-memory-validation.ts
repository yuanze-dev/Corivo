import { parseRawMemoryDocument } from '../markdown/raw-memory-parser.js';
import type {
  ModelProcessor,
  ModelProcessorMetadata,
  ModelProcessorProcessOptions,
  ModelProcessorResult,
} from '../processors/model-processor.js';

const RAW_OUTPUT_RETRY_LIMIT = 1;
const NO_MEMORIES_MARKER = '<!-- NO_MEMORIES -->';

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

    const markdown = resolveMarkdown(result.outputs);
    const validationError = validateRawMarkdown(markdown);
    if (!validationError) {
      return {
        outputs: [markdown],
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

    currentPrompt = buildRawMemoryRetryPrompt(prompt, markdown, validationError.message);
  }

  return lastResult ?? { outputs: [] };
}

function resolveMarkdown(outputs: string[]): string {
  const firstOutput = outputs.find((output) => output.trim().length > 0);
  return (firstOutput ?? NO_MEMORIES_MARKER).trim();
}

function validateRawMarkdown(markdown: string): Error | null {
  try {
    parseRawMemoryDocument(markdown);
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
  invalidMarkdown: string,
  validationError: string,
): string {
  return [
    originalPrompt,
    '## Correction required',
    'Your previous raw memory output was invalid.',
    `Validation error: ${validationError}`,
    'Return the complete corrected raw memory output again.',
    'Do not add commentary outside the required FILE markdown blocks.',
    'Do not use paths like memories/final/... or any extra directories.',
    'Use exactly {scope}/{filename}.md where scope is private or team.',
    'Previous invalid output:',
    invalidMarkdown,
  ].join('\n\n');
}
