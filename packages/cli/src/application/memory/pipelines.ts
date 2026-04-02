import {
  createInitMemoryPipeline,
  createScheduledMemoryPipeline,
  type ClaudeSessionSource,
  type MemoryPipelineDefinition,
  type RawSessionJobSource,
} from '@/memory-pipeline';
import type { ExtractionProvider } from '@/extraction/types';

export function buildInitMemoryPipeline(options: {
  sessionSource: ClaudeSessionSource;
  provider: ExtractionProvider;
}): MemoryPipelineDefinition {
  return createInitMemoryPipeline({ sessionSource: options.sessionSource });
}

export function buildScheduledMemoryPipeline(options: {
  rawSessionJobSource: RawSessionJobSource;
  provider: ExtractionProvider;
}): MemoryPipelineDefinition {
  return createScheduledMemoryPipeline({ rawSessionJobSource: options.rawSessionJobSource });
}
