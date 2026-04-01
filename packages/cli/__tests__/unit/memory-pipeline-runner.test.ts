import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  MemoryPipelineArtifactStore,
  MemoryPipelineStage,
  PipelineStageResult,
  PipelineStageStatus,
} from '../../src/memory-pipeline/types.js';
import { readRunManifest } from '../../src/memory-pipeline/state/run-manifest.js';
import { FileRunLock, LOCK_RELEASE_SENTINEL } from '../../src/memory-pipeline/state/run-lock.js';
import { MemoryPipelineRunner } from '../../src/memory-pipeline/runner.js';
const createArtifactStore = (): MemoryPipelineArtifactStore => ({
  async writeArtifact(input) {
    return {
      id: `artifact-${input.kind}`,
      kind: input.kind,
      version: 1,
      path: 'descriptor.json',
      source: input.source,
      createdAt: Date.now(),
    };
  },
  async persistDescriptor() {},
  async getDescriptor() {
    return undefined;
  },
});

describe('MemoryPipelineRunner', () => {
  it('runs stages sequentially and records their results', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      runIdGenerator: () => 'run-sequence',
    });

    const calls: string[] = [];
    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('a', async () => {
          calls.push('a');
          return createResult('a', 'success');
        }),
        createStage('b', async () => {
          calls.push('b');
          return createResult('b', 'success', { inputCount: 1 });
        }),
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(calls).toEqual(['a', 'b']);
    expect(result.status).toBe('success');
    expect(result.stages).toHaveLength(2);

    const manifest = await readRunManifest(path.join(root, 'runs', 'run-sequence', 'manifest.json'));
    expect(manifest.status).toBe('success');
    expect(manifest.stages.map((stage) => stage?.stageId)).toEqual(['a', 'b']);
  });

  it('halts when a stage fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      runIdGenerator: () => 'run-failure',
    });

    const calls: string[] = [];
    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('first', async () => {
          calls.push('first');
          return createResult('first', 'success');
        }),
        createStage('second', async () => {
          calls.push('second');
          return createResult('second', 'failed', { error: 'kaboom' });
        }),
        createStage('third', async () => {
          calls.push('third');
          return createResult('third', 'success');
        }),
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(calls).toEqual(['first', 'second']);
    expect(result.status).toBe('failed');
    expect(result.stages).toHaveLength(2);

    const manifest = await readRunManifest(path.join(root, 'runs', 'run-failure', 'manifest.json'));
    expect(manifest.status).toBe('failed');
    expect(manifest.stages.map((stage) => stage?.status)).toEqual(['success', 'failed']);
  });

  it('converts thrown stage into failed result and stops', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
    });

    const calls: string[] = [];
    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('boom', async () => {
          calls.push('boom');
          throw new Error('boom');
        }),
        createStage('never', async () => {
          calls.push('never');
          return createResult('never', 'success');
        }),
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(calls).toEqual(['boom']);
    expect(result.status).toBe('failed');
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].stageId).toBe('boom');
    expect(result.stages[0].error).toContain('boom');
  });

  it('records partial and skipped stage statuses without stopping', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
    });

    const calls: string[] = [];
    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('partial', async () => {
          calls.push('partial');
          return createResult('partial', 'partial');
        }),
        createStage('skipped', async () => {
          calls.push('skipped');
          return createResult('skipped', 'skipped');
        }),
        createStage('final', async () => {
          calls.push('final');
          return createResult('final', 'success');
        }),
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(calls).toEqual(['partial', 'skipped', 'final']);
    expect(result.stages.map((stage) => stage.status)).toEqual(['partial', 'skipped', 'success']);
    expect(result.status).toBe('success');
  });

  it('throws when the lock is already held', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lockA = new FileRunLock(lockPath);
    const lockB = new FileRunLock(lockPath);

    await lockA.acquire('run-duplicate');
    try {
      await expect(lockB.acquire('run-duplicate-again')).rejects.toThrow(/memory pipeline already running/);
    } finally {
      await lockA.release();
    }
  });

  it('removes a stale lock file when writing fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class FailingWriteLock extends FileRunLock {
      protected async writeLockContent(handle: FileHandle, runId: string): Promise<void> {
        throw new Error('write failure');
      }
    }

    const lock = new FailingWriteLock(lockPath);

    await expect(lock.acquire('run-fail')).rejects.toThrow('write failure');

    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
  });

  it('keeps a replaced lock file when releasing after losing ownership', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lock = new FileRunLock(lockPath);

    await lock.acquire('run-original');
    await unlink(lockPath);
    await writeFile(lockPath, 'run-other', 'utf8');

    await lock.release();

    expect((await readFile(lockPath, 'utf8')).trim()).toBe('run-other');
    await unlink(lockPath);
  });

  it('marks the lock as released and allows another acquire', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lockA = new FileRunLock(lockPath);

    await lockA.acquire('run-one');
    await lockA.release();

    expect(await readFile(lockPath, 'utf8')).toBe(LOCK_RELEASE_SENTINEL);

    const lockB = new FileRunLock(lockPath);
    await lockB.acquire('run-two');
    expect(await readFile(lockPath, 'utf8')).toBe('run-two');

    await lockB.release();
    expect(await readFile(lockPath, 'utf8')).toBe(LOCK_RELEASE_SENTINEL);
    await unlink(lockPath);
  });

});

function createStage(id: string, run: MemoryPipelineStage['run']): MemoryPipelineStage {
  return { id, run };
}

function createResult(
  stageId: string,
  status: PipelineStageStatus,
  overrides?: Partial<{ inputCount: number; outputCount: number; artifactIds: string[]; error: string }>,
): PipelineStageResult {
  return {
    stageId,
    status,
    inputCount: overrides?.inputCount ?? 0,
    outputCount: overrides?.outputCount ?? 1,
    artifactIds: overrides?.artifactIds ?? [],
    ...('error' in (overrides ?? {}) ? { error: overrides?.error } : {}),
  };
}
