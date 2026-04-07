import type { Block } from '@/domain/memory/models/block.js';
import type { ConflictReminder } from '@/domain/memory/services/conflict-detector.js';
import type { CorivoSurfaceItem } from '@/runtime/types.js';
import type { RuntimeDatabase } from '@/application/query/retrieval.js';

export type MemoryProviderName = 'local' | 'supermemory';

export interface MemoryProviderHealthcheckResult {
  ok: boolean;
  provider: MemoryProviderName;
  message?: string;
}

export interface MemoryProviderSaveInput {
  content: string;
  annotation: string;
  source?: string;
}

export interface MemoryProviderSaveResult {
  ok: boolean;
  provider: MemoryProviderName;
  id?: string;
  /**
   * Local-only fields. Remote providers should omit this entirely.
   */
  local?: {
    id: string;
    vitality: number;
    status: Block['status'];
  };
  /**
   * Optional friendly conflict reminder when the provider has access to prior memories
   * (typically local SQLite). Remote providers may omit.
   */
  conflictReminder?: ConflictReminder | null;
  error?: string;
}

export interface MemoryProviderRecallInput {
  prompt: string;
  /**
   * Local provider uses the runtime DB for recall scoring and raw transcript fallback.
   * Remote providers (eg Supermemory) may ignore this.
   */
  db?: RuntimeDatabase;
}

export interface MemoryProviderSearchInput {
  query: string;
  limit: number;
  /**
   * Local provider uses the runtime DB for explicit search. Remote providers may ignore this.
   */
  db?: RuntimeDatabase;
}

export class MemoryProviderUnavailableError extends Error {
  override name = 'MemoryProviderUnavailableError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = options.cause;
    }
  }
}

export function isMemoryProviderUnavailableError(
  error: unknown,
): error is MemoryProviderUnavailableError {
  return error instanceof MemoryProviderUnavailableError;
}

export interface MemoryProvider {
  provider: MemoryProviderName;
  save(input: MemoryProviderSaveInput): Promise<MemoryProviderSaveResult>;
  search(input: MemoryProviderSearchInput): Promise<Block[]>;
  recall(input: MemoryProviderRecallInput): Promise<CorivoSurfaceItem | null>;
  healthcheck(): Promise<MemoryProviderHealthcheckResult>;
}
