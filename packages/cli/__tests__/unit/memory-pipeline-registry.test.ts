import { describe, expect, it } from 'vitest';
import { createMemoryPipelineRegistry } from '../../src/memory-pipeline/registry.js';

describe('memory pipeline registry', () => {
  it('returns registered pipelines by id', () => {
    const pipeline = { id: 'init-memory-pipeline', stages: [] };
    const registry = createMemoryPipelineRegistry([pipeline]);

    expect(registry.get('init-memory-pipeline')).toBe(pipeline);
    expect(registry.get('scheduled-memory-pipeline')).toBeUndefined();
  });

  it('throws when registering a duplicate pipeline id', () => {
    const registry = createMemoryPipelineRegistry();
    const pipeline = { id: 'init-memory-pipeline', stages: [] };

    registry.register(pipeline);
    expect(() => registry.register(pipeline)).toThrow(/pipeline already registered/);
  });

  it('throws when initial definitions contain duplicate ids', () => {
    const pipeline = { id: 'scheduled-memory-pipeline', stages: [] };
    expect(() =>
      createMemoryPipelineRegistry([pipeline, { id: 'scheduled-memory-pipeline', stages: [] }]),
    ).toThrow(/pipeline already registered/);
  });
});
