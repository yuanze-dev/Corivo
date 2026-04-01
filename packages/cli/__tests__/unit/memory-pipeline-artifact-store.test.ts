import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../../src/memory-pipeline/artifacts/artifact-store.js';
import { readRunManifest, writeRunManifest } from '../../src/memory-pipeline/state/run-manifest.js';

describe('ArtifactStore', () => {
  it('creates detail and index artifact directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const store = new ArtifactStore(root);
    const detail = await store.writeArtifact({
      kind: 'detail-record',
      source: 'test',
      body: 'hello',
    });

    expect(detail.path).toContain(path.join('artifacts', 'detail'));
    const fetchedDetail = await store.getDescriptor(detail.id);
    expect(fetchedDetail?.id).toBe(detail.id);

    const index = await store.writeArtifact({
      kind: 'memory-index',
      source: 'index',
      body: 'idx',
    });
    expect(index.path).toContain(path.join('artifacts', 'index'));
  });

  it('persists a run manifest file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const manifestPath = path.join(root, 'runs', 'run_1', 'manifest.json');
    await writeRunManifest(manifestPath, {
      runId: 'run_1',
      pipelineId: 'init-memory-pipeline',
      trigger: 'manual',
      status: 'running',
      stages: [],
    });
    const content = await readRunManifest(manifestPath);
    expect(content.runId).toBe('run_1');
  });

  it('writes other artifacts under run stages directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const store = new ArtifactStore(root);
    const descriptor = await store.writeArtifact({
      kind: 'summary-batch',
      source: 'stage',
      runId: 'run-2',
      body: '{}',
    });

    expect(descriptor.path).toContain(path.join('runs', 'run-2', 'stages'));
  });

  it('normalizes runId segments to stay inside root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const store = new ArtifactStore(root);
    const descriptor = await store.writeArtifact({
      kind: 'summary-batch',
      source: 'stage',
      runId: '../escaped',
      body: '{}',
    });

    expect(descriptor.path).not.toContain('..');
    expect(descriptor.path).toContain(path.join('runs', 'escaped', 'stages'));
    const stored = await store.getDescriptor(descriptor.id);
    expect(stored?.id).toBe(descriptor.id);
  });

  it('rejects descriptors whose paths escape root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const store = new ArtifactStore(root);
    const descriptor = {
      id: 'detail-record-123',
      kind: 'detail-record',
      version: 1,
      path: '../escape/artifact.json',
      source: 'test',
      createdAt: Date.now(),
    };

    await expect(store.persistDescriptor(descriptor)).rejects.toThrow('path escapes root');
  });

  it('rejects writing artifacts through symlinked directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'corivo-memory-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'corivo-outside-'));
    await mkdir(path.join(root, 'runs'), { recursive: true });
    await symlink(outside, path.join(root, 'runs', 'link-escape'), 'dir');
    const store = new ArtifactStore(root);

    await expect(
      store.writeArtifact({
        kind: 'summary-batch',
        source: 'stage',
        runId: 'link-escape',
        body: '{}',
      }),
    ).rejects.toThrow('path escapes root directory');
  });
});
