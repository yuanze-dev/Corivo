import type { ExtractionInput, ExtractionResult } from './types';
import { extractWithClaude } from './providers/claude';
import { extractWithCodex } from './providers/codex';

export { normalizePrompt, DEFAULT_TIMEOUT_MS } from './shared';
export { extractWithClaude } from './providers/claude';
export { extractWithCodex } from './providers/codex';

export async function extractWithProvider(
  input: ExtractionInput
): Promise<ExtractionResult> {
  if (input.provider === 'claude') {
    return await extractWithClaude({
      prompt: input.prompt,
      timeoutMs: input.timeoutMs,
    });
  }

  return await extractWithCodex({
    prompt: input.prompt,
    timeoutMs: input.timeoutMs,
  });
}
