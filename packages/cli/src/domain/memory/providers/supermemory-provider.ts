import Supermemory, {
  APIConnectionError,
  APIConnectionTimeoutError,
  InternalServerError,
  RateLimitError,
} from 'supermemory';
import type { DocumentAddResponse } from 'supermemory/resources/documents.js';
import type { SearchMemoriesResponse } from 'supermemory/resources/search.js';
import type { Block } from '@/domain/memory/models/block.js';
import type { CorivoSurfaceItem } from '@/runtime/types.js';
import {
  MemoryProviderUnavailableError,
  type MemoryProvider,
  type MemoryProviderHealthcheckResult,
  type MemoryProviderSaveInput,
} from './types.js';

export interface SupermemoryProviderConfig {
  apiKey: string;
  containerTag: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTransportUnavailableError(error: unknown): boolean {
  // Only wrap errors that strongly suggest transport/service unavailability.
  return (
    error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  );
}

function toTimestampMs(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function toMetadataValue(value: unknown): string | number | boolean | Array<string> | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value;
  }
  return undefined;
}

function confidenceFromSimilarity(similarity: number): CorivoSurfaceItem['confidence'] {
  if (similarity >= 0.85) return 'high';
  if (similarity >= 0.7) return 'medium';
  return 'low';
}

function parseIsoToTimestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Unexpected Supermemory timestamp: ${value}`);
  }
  return parsed;
}

type SupermemorySearchResult = SearchMemoriesResponse['results'][number];

function assertValidSearchResult(result: unknown): asserts result is SupermemorySearchResult {
  if (typeof result !== 'object' || result === null) {
    throw new Error('Unexpected Supermemory search result shape: not an object.');
  }
  const candidate = result as any;

  if (typeof candidate.id !== 'string') {
    throw new Error('Unexpected Supermemory search result shape: id is not a string.');
  }
  if (typeof candidate.updatedAt !== 'string') {
    throw new Error('Unexpected Supermemory search result shape: updatedAt is not a string.');
  }
  if (typeof candidate.similarity !== 'number' || !Number.isFinite(candidate.similarity)) {
    throw new Error('Unexpected Supermemory search result shape: similarity is not a number.');
  }
}

type SupermemorySaveInput = MemoryProviderSaveInput & {
  host?: unknown;
  cwd?: unknown;
  sessionId?: unknown;
  memoryType?: unknown;
  createdAt?: unknown;
};

function normalizeSearchResultToBlock(
  result: SupermemorySearchResult,
  nowMs: number,
): Block | null {
  const content = result.memory ?? result.chunk ?? '';
  if (!isNonEmptyString(content)) {
    return null;
  }

  const meta = result.metadata ?? null;
  const annotation =
    meta && typeof meta.annotation === 'string' ? meta.annotation : 'pending';
  const source =
    meta && typeof meta.source === 'string' ? meta.source : 'supermemory';

  const updatedAt = parseIsoToTimestampMs(result.updatedAt);

  return {
    id: `blk_sm_${result.id}`,
    content,
    annotation,
    refs: [],
    source,
    vitality: 90,
    status: 'active',
    access_count: 0,
    last_accessed: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function normalizeTopHitToSurfaceItem(
  top: SupermemorySearchResult,
): CorivoSurfaceItem | null {
  const claim = top.memory ?? top.chunk ?? '';
  if (!isNonEmptyString(claim)) {
    // If Supermemory returned a top hit without memory/chunk content, treat it as a contract mismatch.
    throw new Error('Unexpected Supermemory recall hit: missing memory/chunk content.');
  }

  const meta = top.metadata ?? null;
  const annotation = meta && typeof meta.annotation === 'string' ? meta.annotation : undefined;

  return {
    mode: 'recall',
    confidence: confidenceFromSimilarity(top.similarity),
    whyNow: annotation ? `Matched in Supermemory (${annotation}).` : 'Matched in Supermemory.',
    claim,
    evidence: [],
    memoryIds: [top.id],
  };
}

export function createSupermemoryMemoryProvider(config: SupermemoryProviderConfig): MemoryProvider {
  const { apiKey, containerTag } = config;
  const client = new Supermemory({ apiKey });

  return {
    provider: 'supermemory',

    async save(input: SupermemorySaveInput) {
      try {
        const metadata: Record<string, string | number | boolean | Array<string>> = {};

        const annotation = toMetadataValue(input.annotation);
        if (annotation !== undefined) metadata.annotation = annotation;
        const source = toMetadataValue(input.source);
        if (source !== undefined) metadata.source = source;

        const host = toMetadataValue(input.host);
        if (host !== undefined) metadata.host = host;
        const cwd = toMetadataValue(input.cwd);
        if (cwd !== undefined) metadata.cwd = cwd;
        const sessionId = toMetadataValue(input.sessionId);
        if (sessionId !== undefined) metadata.sessionId = sessionId;
        const memoryType = toMetadataValue(input.memoryType);
        if (memoryType !== undefined) metadata.memoryType = memoryType;
        const createdAt = toMetadataValue(input.createdAt);
        if (createdAt !== undefined) metadata.createdAt = createdAt;

        const response: DocumentAddResponse = await client.documents.add({
          content: input.content,
          customId: toStringOrUndefined(input.customId),
          containerTag,
          metadata: Object.keys(metadata).length ? metadata : undefined,
        });

        return { ok: true, provider: 'supermemory', id: response.id };
      } catch (error) {
        if (isTransportUnavailableError(error)) {
          throw new MemoryProviderUnavailableError('Supermemory provider is unavailable.', { cause: error });
        }
        throw error;
      }
    },

    async search(input) {
      try {
        const response: SearchMemoriesResponse = await client.search.memories({
          q: input.query,
          containerTag,
          limit: input.limit,
        });

        if (!response || !Array.isArray(response.results)) {
          throw new Error('Unexpected Supermemory search response shape: results is not an array.');
        }

        const nowMs = Date.now();
        const blocks: Block[] = [];
        for (const result of response.results) {
          assertValidSearchResult(result);
          const block = normalizeSearchResultToBlock(result, nowMs);
          if (block) blocks.push(block);
        }
        return blocks;
      } catch (error) {
        if (isTransportUnavailableError(error)) {
          throw new MemoryProviderUnavailableError('Supermemory provider is unavailable.', { cause: error });
        }
        throw error;
      }
    },

    async recall(input) {
      try {
        const response: SearchMemoriesResponse = await client.search.memories({
          q: input.prompt,
          containerTag,
          limit: 5,
        });

        if (!response || !Array.isArray(response.results)) {
          throw new Error('Unexpected Supermemory recall response shape: results is not an array.');
        }

        const top = response.results[0];
        if (!top) {
          return null;
        }
        assertValidSearchResult(top);
        return normalizeTopHitToSurfaceItem(top);
      } catch (error) {
        if (isTransportUnavailableError(error)) {
          throw new MemoryProviderUnavailableError('Supermemory provider is unavailable.', { cause: error });
        }
        throw error;
      }
    },

    async healthcheck(): Promise<MemoryProviderHealthcheckResult> {
      try {
        await client.profile({ containerTag });
        return { ok: true, provider: 'supermemory' };
      } catch (error) {
        return {
          ok: false,
          provider: 'supermemory',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
