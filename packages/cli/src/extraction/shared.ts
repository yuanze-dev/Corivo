import { spawn } from 'node:child_process';
import type { ExtractionPrompt, ExtractionProvider, ExtractionResult } from './types.js';

export const DEFAULT_TIMEOUT_MS = 60_000;

export function normalizePrompt(prompt: ExtractionPrompt): string {
  if (typeof prompt === 'string') {
    return prompt.trim();
  }

  return prompt
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');
}

export async function runProviderCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (result: {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      timedOut: boolean;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', (error) => {
      fail(error);
    });

    child.once('close', (exitCode) => {
      finish({
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
  });
}

export function mapExecutionResult(
  provider: ExtractionProvider,
  execution: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  },
): ExtractionResult {
  if (execution.timedOut) {
    return {
      provider,
      status: 'timeout',
      result: null,
      error: `${provider} extraction timed out`,
    };
  }

  if (execution.exitCode !== 0) {
    return {
      provider,
      status: 'error',
      result: null,
      error: execution.stderr.trim() || `${provider} exited with code ${execution.exitCode}`,
    };
  }

  const output = execution.stdout.trim();
  if (!output) {
    return {
      provider,
      status: 'error',
      result: null,
      error: `${provider} returned empty output`,
    };
  }

  return {
    provider,
    status: 'success',
    result: output,
  };
}
