import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, unlink, writeFile, link } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  MemoryPipelineArtifactStore,
  MemoryPipelineStage,
  PipelineStageResult,
  PipelineStageStatus,
} from '../../src/memory-pipeline/types.js';
import { ArtifactStore } from '../../src/memory-pipeline/artifacts/artifact-store.js';
import { readRunManifest } from '../../src/memory-pipeline/state/run-manifest.js';
import { FileRunLock } from '../../src/memory-pipeline/state/run-lock.js';
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
  async readArtifact() {
    return '';
  },
  async listArtifacts() {
    return [];
  },
});

function parseLockContent(raw: string) {
  const trimmed = raw.trim();
  const separator = trimmed.indexOf(':');
  if (separator === -1) {
    return { token: trimmed, runId: '' };
  }
  return {
    token: trimmed.slice(0, separator),
    runId: trimmed.slice(separator + 1),
  };
}

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

  it('allows later stages to read previous stage artifacts from context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: new ArtifactStore(root),
      lock,
      runRoot: root,
      runIdGenerator: () => 'run-artifact-read',
    });

    let producedArtifactId = '';
    let consumedBody = '';
    let queriedIds: string[] = [];

    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('produce', async (context) => {
          const descriptor = await context.artifactStore.writeArtifact({
            runId: context.runId,
            kind: 'summary-batch',
            source: 'stage-produce',
            body: 'artifact-body',
          });
          producedArtifactId = descriptor.id;

          return createResult('produce', 'success', { artifactIds: [descriptor.id] });
        }),
        createStage('consume', async (context) => {
          consumedBody = await context.artifactStore.readArtifact(producedArtifactId);
          queriedIds = (
            await context.artifactStore.listArtifacts({
              runId: context.runId,
              source: 'stage-produce',
              kind: 'summary-batch',
            })
          ).map((descriptor) => descriptor.id);

          return createResult('consume', 'success');
        }),
      ],
    };

    const result = await runner.run(pipeline, { type: 'manual', runAt: Date.now() });

    expect(result.status).toBe('success');
    expect(consumedBody).toBe('artifact-body');
    expect(queriedIds).toEqual([producedArtifactId]);
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

  it('shares pipeline state across stages and marks claimed raw session jobs failed when a later stage fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lock = new FileRunLock(path.join(root, 'run.lock'));
    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      runIdGenerator: () => 'run-shared-state',
    });
    const markFailed = vi.fn(async () => {});

    const pipeline = {
      id: 'scheduled-memory-pipeline',
      stages: [
        createStage('collect', async (context) => {
          context.state.set('rawSessionJobSource', {
            markFailed,
          });
          context.state.set('rawSessionJobs', [
            { job: { id: 'job-1' } },
          ]);
          return createResult('collect', 'success');
        }),
        createStage('verify-state', async (context) => {
          expect(context.state.get('rawSessionJobs')).toEqual([{ job: { id: 'job-1' } }]);
          return createResult('verify-state', 'failed', { error: 'summarize failed' });
        }),
      ],
    };

    const result = await runner.run(pipeline as any, { type: 'manual', runAt: Date.now() });

    expect(result.status).toBe('failed');
    expect(markFailed).toHaveBeenCalledWith('job-1', 'summarize failed');
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

    class InspectableLock extends FileRunLock {
      public lastOwnerPath?: string;

      protected createOwnerFilePath(runId: string): string {
        const ownerPath = super.createOwnerFilePath(runId);
        this.lastOwnerPath = ownerPath;
        return ownerPath;
      }

      protected async writeLockContent(handle: FileHandle, runId: string): Promise<void> {
        throw new Error('write failure');
      }
    }

    const lock = new InspectableLock(lockPath);

    await expect(lock.acquire('run-fail')).rejects.toThrow('write failure');

    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
    if (lock.lastOwnerPath) {
      await expect(readFile(lock.lastOwnerPath, 'utf8')).rejects.toThrow();
    }
  });

  it('keeps a replaced lock file when releasing after losing ownership', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lock = new FileRunLock(lockPath);

    await lock.acquire('run-original');
    await unlink(lockPath);
    await writeFile(lockPath, 'manualtoken:run-other', 'utf8');

    await lock.release();

    expect(parseLockContent(await readFile(lockPath, 'utf8')).runId).toBe('run-other');
    await unlink(lockPath);
  });

  it('marks the lock as released and allows another acquire', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lockA = new FileRunLock(lockPath);

    await lockA.acquire('run-one');
    await lockA.release();

    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();

    const lockB = new FileRunLock(lockPath);
    await lockB.acquire('run-two');
    expect(parseLockContent(await readFile(lockPath, 'utf8')).runId).toBe('run-two');

    await lockB.release();
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
  });

  it('propagates lock unlink failures and retains owner metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class FailingDeleteLock extends FileRunLock {
      calls = 0;

      protected async cleanupRetiredPath(retiredPath: string): Promise<void> {
        this.calls += 1;
        if (this.calls === 1) {
          throw new Error('unlink failed');
        }
        await super.cleanupRetiredPath(retiredPath);
      }
    }

    const lock = new FailingDeleteLock(lockPath);
    await lock.acquire('run-broken');

    await expect(lock.release()).rejects.toThrow('unlink failed');

    const files = await readdir(root);
    expect(files).not.toContain('run.lock');
    expect(files.some((name) => name.startsWith('.corivo-lock-retired-'))).toBe(true);

    await expect(lock.release()).resolves.toBeUndefined();
    const finalFiles = await readdir(root);
    expect(finalFiles).not.toContain('run.lock');
    expect(finalFiles.some((name) => name.startsWith('.corivo-lock-'))).toBe(false);
  });

  it('does not unlink a lock when the owner path is missing and a new owner exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class InstrumentedLock extends FileRunLock {
      public lastOwner?: string;

      protected createOwnerFilePath(runId: string): string {
        const ownerPath = super.createOwnerFilePath(runId);
        this.lastOwner = ownerPath;
        return ownerPath;
      }
    }

    const lockA = new InstrumentedLock(lockPath);
    await lockA.acquire('run-a');
    const ownerA = lockA.lastOwner;
    await unlink(ownerA!);

    await unlink(lockPath);
    const ownerB = path.join(root, `.corivo-lock-b-${Date.now()}`);
    const ownerBToken = `owner-b-${Date.now()}`;
    await writeFile(ownerB, `${ownerBToken}:run-b`, 'utf8');
    await link(ownerB, lockPath);

    await expect(lockA.release()).resolves.toBeUndefined();
    expect(parseLockContent(await readFile(lockPath, 'utf8')).runId).toBe('run-b');

    await unlink(lockPath);
    await unlink(ownerB);

    await lockA.acquire('run-after');
    await lockA.release();
  });

  it('cleans stale lock when owner file is missing but run.lock still belongs to this run', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class InstrumentedLock extends FileRunLock {
      public lastOwnerPath?: string;

      protected createOwnerFilePath(runId: string): string {
        const ownerPath = super.createOwnerFilePath(runId);
        this.lastOwnerPath = ownerPath;
        return ownerPath;
      }
    }

    const lock = new InstrumentedLock(lockPath);
    await lock.acquire('run-stale');
    await unlink(lock.lastOwnerPath!);

    await expect(lock.release()).resolves.toBeUndefined();
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();

    const lockB = new FileRunLock(lockPath);
    await lockB.acquire('run-new');
    await lockB.release();
  });

  it('renames run.lock before cleaning so new owner survives the release window', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class RacingLock extends FileRunLock {
      protected async cleanupRetiredPath(retiredPath: string): Promise<void> {
        await writeFile(lockPath, `${Date.now()}-newtoken:run-newowner`, 'utf8');
        await super.cleanupRetiredPath(retiredPath);
      }
    }

    const lock = new RacingLock(lockPath);
    await lock.acquire('run-race');
    await lock.release();

    const parsed = parseLockContent(await readFile(lockPath, 'utf8'));
    expect(parsed.runId).toBe('run-newowner');
    await unlink(lockPath);
  });

  it('throws when owner stat fails and retains lock', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class StatFailLock extends FileRunLock {
      owner?: string;
      throwOnce = true;

      protected createOwnerFilePath(runId: string): string {
        this.owner = super.createOwnerFilePath(runId);
        return this.owner;
      }

      protected async getStats(target: string) {
        if (this.throwOnce && target === this.owner) {
          this.throwOnce = false;
          const error = new Error('stat fail');
          (error as NodeJS.ErrnoException).code = 'EACCES';
          throw error;
        }
        return super.getStats(target);
      }
    }

    const lock = new StatFailLock(lockPath);
    await lock.acquire('run-stat');

    await expect(lock.release()).rejects.toThrow('stat fail');
    const files = await readdir(root);
    expect(files).toContain('run.lock');
    expect(files.some((name) => name.startsWith('.corivo-lock-'))).toBe(true);

    await expect(lock.release()).resolves.toBeUndefined();
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
  });

  it('propagates manifest write failure after a stage and releases lock', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lock = new FileRunLock(lockPath);
    const stageCalls: string[] = [];

    let call = 0;
    const manifestWriter = async () => {
      call += 1;
      if (call === 2) {
        throw new Error('post-stage failure');
      }
    };

    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      manifestWriter,
    });

    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [createStage('stage', async () => {
        stageCalls.push('stage');
        return createResult('stage', 'success');
      })],
    };

    await expect(runner.run(pipeline, { type: 'manual', runAt: Date.now() })).rejects.toThrow('post-stage failure');
    expect(stageCalls).toEqual(['stage']);

    const lock2 = new FileRunLock(lockPath);
    const runner2 = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock: lock2,
      runRoot: root,
    });

    await expect(runner2.run(pipeline, { type: 'manual', runAt: Date.now() })).resolves.toMatchObject({ status: 'success' });
  });

  it('propagates final manifest write failure after all stages', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');
    const lock = new FileRunLock(lockPath);
    const stageCalls: string[] = [];

    let call = 0;
    const manifestWriter = async () => {
      call += 1;
      if (call === 3) {
        throw new Error('final failure');
      }
    };

    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      manifestWriter,
    });

    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [createStage('succeed', async () => {
        stageCalls.push('succeed');
        return createResult('succeed', 'success');
      })],
    };

    await expect(runner.run(pipeline, { type: 'manual', runAt: Date.now() })).rejects.toThrow('final failure');
    expect(stageCalls).toEqual(['succeed']);
  });

  it('releases the lock when the initial manifest write fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const lockPath = path.join(root, 'run.lock');

    class TrackingLock extends FileRunLock {
      releaseCalls = 0;

      async release(): Promise<void> {
        this.releaseCalls += 1;
        return super.release();
      }
    }

    const lock = new TrackingLock(lockPath);
    const stageCalls: string[] = [];
    const pipeline = {
      id: 'init-memory-pipeline',
      stages: [
        createStage('only', async () => {
          stageCalls.push('only');
          return createResult('only', 'success');
        }),
      ],
    };

    const runner = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock,
      runRoot: root,
      manifestWriter: async () => {
        throw new Error('manifest failure');
      },
    });

    await expect(runner.run(pipeline, { type: 'manual', runAt: Date.now() })).rejects.toThrow(
      /manifest failure/,
    );
    expect(stageCalls).toEqual([]);
    expect(lock.releaseCalls).toBe(1);

    const lock2 = new FileRunLock(lockPath);
    const runner2 = new MemoryPipelineRunner({
      artifactStore: createArtifactStore(),
      lock: lock2,
      runRoot: root,
    });

    const result = await runner2.run(pipeline, { type: 'manual', runAt: Date.now() });
    expect(result.status).toBe('success');
    expect(stageCalls).toEqual(['only']);
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
