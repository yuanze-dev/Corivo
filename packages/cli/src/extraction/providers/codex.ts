import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExtractionInput, ExtractionResult } from '../types.js';
import { DEFAULT_TIMEOUT_MS, normalizePrompt, runProviderCommand } from '../shared.js';

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

  const tempDir = await mkdtemp(path.join(tmpdir(), 'corivo-codex-exec-'));
  const outputPath = path.join(tempDir, 'last-message.txt');

  try {
    const execution = await runProviderCommand(
      'codex',
      ['exec', '--skip-git-repo-check', '--output-last-message', outputPath],
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      { stdinText: prompt },
    );

    if (execution.timedOut) {
      return {
        provider: 'codex',
        status: 'timeout',
        result: null,
        error: 'codex extraction timed out',
      };
    }

    if (execution.exitCode !== 0) {
      return {
        provider: 'codex',
        status: 'error',
        result: null,
        error: execution.stderr.trim() || `codex exited with code ${execution.exitCode}`,
      };
    }

    let output = '';
    try {
      output = (await readFile(outputPath, 'utf8')).trim();
    } catch (error) {
      return {
        provider: 'codex',
        status: 'error',
        result: null,
        error: `codex last-message output unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!output) {
      return {
        provider: 'codex',
        status: 'error',
        result: null,
        error: 'codex returned empty last-message output',
      };
    }

    return {
      provider: 'codex',
      status: 'success',
      result: output,
    };
  } catch (error) {
    return {
      provider: 'codex',
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : 'codex extraction failed',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
