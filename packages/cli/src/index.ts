/**
 * Corivo - your silicon-based colleague
 *
 * it lives only for you
 */

export * from './models';
export * from './errors';
export * from './crypto/keys';
export * from './storage/database';
export * from './engine/rules';
export type {
  ExtractionInput,
  ExtractionPrompt,
  ExtractionProvider,
  ExtractionResult,
  ExtractionStatus,
} from './extraction/types.js';
export { extractWithClaude, extractWithCodex, extractWithProvider } from './extraction/index.js';
export type { RealtimeCollector, CorivoPlugin } from './ingestors/index.js';
export * from './memory-pipeline/index.js';
