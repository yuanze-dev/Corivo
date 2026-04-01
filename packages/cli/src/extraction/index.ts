import type { ExtractionInput, ExtractionResult } from './types.js';
import { extractWithClaude } from './providers/claude.js';
import { extractWithCodex } from './providers/codex.js';

export { normalizePrompt, DEFAULT_TIMEOUT_MS } from './shared.js';
export { extractWithClaude } from './providers/claude.js';
export { extractWithCodex } from './providers/codex.js';

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
