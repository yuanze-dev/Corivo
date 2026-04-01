import type { ExtractionInput, ExtractionResult } from '../types.js';
import { DEFAULT_TIMEOUT_MS, mapExecutionResult, normalizePrompt, runProviderCommand } from '../shared.js';

export async function extractWithCodex(
  input: Omit<ExtractionInput, 'provider'> & { provider?: 'codex' }
): Promise<ExtractionResult> {
  const prompt = normalizePrompt(input.prompt);

  if (!prompt) {
    return {
      provider: 'codex',
      status: 'error',
      result: null,
      error: 'codex extraction prompt is empty',
    };
  }

  try {
    const execution = await runProviderCommand('codex', ['exec', '--skip-git-repo-check', prompt], input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return mapExecutionResult('codex', execution);
  } catch (error) {
    return {
      provider: 'codex',
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : 'codex extraction failed',
    };
  }
}
