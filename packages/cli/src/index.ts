/**
 * Corivo - your silicon-based colleague
 *
 * it lives only for you
 */

/**
 * Root library entrypoint boundary:
 * keep public runtime/library exports here; CLI command wiring stays in `src/cli/*`.
 */
export * from '@/domain/memory/models';
export * from './errors';
export * from './crypto/keys';
export * from '@/storage/database';
export * from './engine/rules';
export type {
  ExtractionInput,
  ExtractionPrompt,
  ExtractionProvider,
  ExtractionResult,
  ExtractionStatus,
} from '@/infrastructure/llm/types.js';
export { extractWithClaude, extractWithCodex, extractWithProvider } from '@/infrastructure/llm/index.js';
export type { RealtimeCollector, CorivoPlugin } from './ingestors/index.js';
export * from './memory-pipeline/index.js';
