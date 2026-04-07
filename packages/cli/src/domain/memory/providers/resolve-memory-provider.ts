import type { CorivoConfig } from '@/config.js';
import { ConfigError } from '@/errors/index.js';
import { createLocalMemoryProvider } from './local-memory-provider.js';
import { createSupermemoryMemoryProvider } from './supermemory-provider.js';
import {
  type MemoryProvider,
} from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidContainerTag(value: string): boolean {
  // Supermemory containerTag is used as a stable namespace. We validate enough to reject
  // obviously malformed values. Keep aligned with the SDK contract for documents.add:
  // max 100 chars, only alphanumerics, '-', '_', '.'.
  if (!isNonEmptyString(value)) {
    return false;
  }
  if (value.length > 100) {
    return false;
  }
  // No whitespace; restrict to a conservative ASCII subset that is safe in URLs/filters.
  // Allows: letters, digits, '.', '_', '-'.
  return /^[A-Za-z0-9._-]+$/.test(value);
}

export function resolveMemoryProvider(config?: CorivoConfig | null): MemoryProvider {
  const engine = config?.memoryEngine;
  const provider = (engine as any)?.provider as unknown;

  if (!engine || provider === 'local') {
    return createLocalMemoryProvider();
  }

  if (provider === 'supermemory') {
    const apiKey = (engine as any)?.supermemory?.apiKey;
    const containerTag = (engine as any)?.supermemory?.containerTag;
    if (!isNonEmptyString(apiKey) || !isNonEmptyString(containerTag) || !isValidContainerTag(containerTag)) {
      throw new ConfigError(
        'Supermemory is configured incorrectly. Please set memoryEngine.supermemory.apiKey and memoryEngine.supermemory.containerTag.',
      );
    }

    return createSupermemoryMemoryProvider({ apiKey, containerTag });
  }

  throw new ConfigError(`Unknown memory engine provider: ${String(provider)}`);
}
