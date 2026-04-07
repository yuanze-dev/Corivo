import type { CorivoSurfaceItem } from '@/runtime/types.js';
import type { MemoryProvider, MemoryProviderRecallInput } from '@/domain/memory/providers/types.js';

/**
 * Thin wrapper to keep provider-backed recall behavior behind a single call site.
 * Current providers already return a `CorivoSurfaceItem | null` directly.
 */
export async function providerRecall(
  provider: MemoryProvider,
  input: MemoryProviderRecallInput,
): Promise<CorivoSurfaceItem | null> {
  return provider.recall(input);
}

