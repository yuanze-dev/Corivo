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
export * from '@/domain/errors/index.js';
export * from '@/infrastructure/crypto/keys.js';
export * from '@/infrastructure/storage/facade/database';
export * from '@/domain/memory/rules.js';
export type {
  ExtractionInput,
  ExtractionPrompt,
  ExtractionProvider,
  ExtractionResult,
  ExtractionStatus,
} from '@/infrastructure/llm/types.js';
export { extractWithClaude, extractWithCodex, extractWithProvider } from '@/infrastructure/llm/index.js';
export type { RealtimeCollector, CorivoPlugin } from '@/infrastructure/ingestors/index.js';
export * from './memory-pipeline/index.js';
