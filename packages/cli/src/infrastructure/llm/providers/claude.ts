import type { ExtractionInput, ExtractionResult } from '../types';
import { DEFAULT_TIMEOUT_MS, mapExecutionResult, normalizePrompt, runProviderCommand } from '../shared';

export async function extractWithClaude(
  input: Omit<ExtractionInput, 'provider'> & { provider?: 'claude' }
): Promise<ExtractionResult> {
  const prompt = normalizePrompt(input.prompt);

  if (!prompt) {
    return {
      provider: 'claude',
      status: 'error',
      result: null,
      error: 'claude extraction prompt is empty',
    };
  }

  try {
    const execution = await runProviderCommand('claude', ['--print', prompt], input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return mapExecutionResult('claude', execution);
  } catch (error) {
    return {
      provider: 'claude',
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : 'claude extraction failed',
    };
  }
}
