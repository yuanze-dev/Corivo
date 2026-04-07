import type { Block } from '@/domain/memory/models/block.js';
import type { MemoryProvider, MemoryProviderSearchInput } from '@/domain/memory/providers/types.js';

/**
 * Thin wrapper to keep provider-backed search normalization behind a single call site.
 * Current providers already return `Block[]` directly, so this is intentionally minimal.
 */
export async function providerSearch(
  provider: MemoryProvider,
  input: MemoryProviderSearchInput,
): Promise<Block[]> {
  return provider.search(input);
}

