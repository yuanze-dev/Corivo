import { describe, expect, it } from 'vitest';
import type {
  PipelineTrigger,
  WorkItem,
  ArtifactDescriptor,
  PipelineStageResult,
  MemoryPipelineDefinition,
} from '../../src/memory-pipeline/index.js';
import type { PipelineTrigger as PublicPipelineTrigger } from '../../src/index.js';

describe('memory pipeline types', () => {
  it('defines supported trigger types', () => {
    const trigger: PipelineTrigger = { type: 'manual', runAt: Date.now() };
    expect(trigger.type).toBe('manual');
  });

  it('exports the trigger type through the public CLI entry point', () => {
    const publicTrigger: PublicPipelineTrigger = { type: 'manual', runAt: Date.now() };
    expect(publicTrigger.runAt).toBeGreaterThan(0);
  });

  it('supports session and block work items', () => {
    const session: WorkItem = { id: 's1', kind: 'session', sourceRef: 'src' };
    const block: WorkItem = { id: 'b1', kind: 'block', sourceRef: 'db' };
    expect(session.kind).toBe('session');
    expect(block.kind).toBe('block');
  });

  it('models stage output with artifact ids', () => {
    const result: PipelineStageResult = {
      stageId: 'collect',
      status: 'success',
      inputCount: 0,
      outputCount: 1,
      artifactIds: ['art1'],
    };
    expect(result.artifactIds).toEqual(['art1']);
  });

  it('supports named pipeline definitions', () => {
    const pipeline: MemoryPipelineDefinition = { id: 'init-memory-pipeline', stages: [] };
    expect(pipeline.id).toBe('init-memory-pipeline');
  });
});
