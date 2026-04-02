import type { PipelineTrigger } from '@/memory-pipeline';
import type { MemoryPipelineMode } from './run-memory-pipeline.js';

export function createMemoryPipelineTrigger(mode: MemoryPipelineMode): PipelineTrigger {
  return {
    type: mode === 'full' ? 'init' : 'manual',
    runAt: Date.now(),
    requestedBy: 'cli',
  };
}
