import type { MemoryPipelineDefinition, MemoryPipelineId } from './types.js';

export interface MemoryPipelineRegistry {
  register(definition: MemoryPipelineDefinition): void;
  get(id: MemoryPipelineId): MemoryPipelineDefinition | undefined;
}

export function createMemoryPipelineRegistry(
  initial: MemoryPipelineDefinition[] = [],
): MemoryPipelineRegistry {
  const pipelines = new Map<MemoryPipelineId, MemoryPipelineDefinition>();

  for (const pipeline of initial) {
    if (pipelines.has(pipeline.id)) {
      throw new Error(`pipeline already registered: ${pipeline.id}`);
    }
    pipelines.set(pipeline.id, pipeline);
  }

  return {
    register(definition: MemoryPipelineDefinition) {
      if (pipelines.has(definition.id)) {
        throw new Error(`pipeline already registered: ${definition.id}`);
      }
      pipelines.set(definition.id, definition);
    },
    get(id: MemoryPipelineId) {
      return pipelines.get(id);
    },
  };
}
