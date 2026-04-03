import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { CorivoDatabase } from '@/storage/database';
import { KeyManager } from '../../src/crypto/keys.js';
import { MemoryProcessingJobQueue } from '../../src/raw-memory/job-queue.js';

describe('MemoryProcessingJobQueue', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let queue: MemoryProcessingJobQueue;

  beforeEach(async () => {
    const randomId = Math.random().toString(36).slice(2, 10);
    dbPath = `/tmp/corivo-job-queue-${randomId}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    queue = new MemoryProcessingJobQueue(db);
  });

  afterEach(async () => {
    db.close();

    const instances = (CorivoDatabase as any).instances;
    if (instances?.has(dbPath)) {
      instances.delete(dbPath);
    }

    await Promise.all([
      fs.unlink(dbPath).catch(() => {}),
      fs.unlink(`${dbPath}-shm`).catch(() => {}),
      fs.unlink(`${dbPath}-wal`).catch(() => {}),
    ]);
  });

  it('keeps only one pending extract job per session key', () => {
    queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-1' });
    queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-1' });

    expect(queue.listPending()).toHaveLength(1);
    expect(queue.listPending()[0]).toMatchObject({
      host: 'codex',
      sessionKey: 'codex:sess-1',
      jobType: 'extract-session',
      dedupeKey: 'extract-session:codex:sess-1',
      status: 'pending',
    });
  });

  it('claims one pending job atomically and marks it running', () => {
    queue.ensureExtractSessionJob({ host: 'claude-code', sessionKey: 'claude-code:sess-2' });

    const claimed = queue.claimNext();
    expect(claimed?.status).toBe('running');
    expect(claimed?.sessionKey).toBe('claude-code:sess-2');
    expect(queue.claimNext()).toBeNull();
  });

  it('marks jobs succeeded and does not re-claim them until re-enqueued', () => {
    const created = queue.ensureExtractSessionJob({ host: 'claude-code', sessionKey: 'claude-code:sess-3' });
    const claimed = queue.claimNext();

    expect(claimed?.id).toBe(created.id);

    queue.markSucceeded(created.id);

    expect(queue.listPending()).toHaveLength(0);
    expect(queue.claimNext()).toBeNull();

    const refreshed = queue.ensureExtractSessionJob({ host: 'claude-code', sessionKey: 'claude-code:sess-3' });
    expect(refreshed.id).toBe(created.id);
    expect(refreshed.attemptCount).toBe(0);
    expect(queue.listPending()).toHaveLength(1);
  });

  it('marks jobs failed with a retry time and makes them claimable later', () => {
    const created = queue.ensureExtractSessionJob({
      host: 'codex',
      sessionKey: 'codex:sess-4',
      availableAt: 1_000,
    });
    const claimed = queue.claimNext(1_000);

    expect(claimed?.id).toBe(created.id);

    queue.markFailed(created.id, 'temporary failure', 5_000);

    expect(queue.claimNext(4_999)).toBeNull();

    const retried = queue.claimNext(5_000);
    expect(retried).toMatchObject({
      id: created.id,
      sessionKey: 'codex:sess-4',
      status: 'running',
      attemptCount: 2,
      lastError: 'temporary failure',
    });
  });

  it('does not let stale workers mark non-running jobs succeeded or failed', () => {
    const created = queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-5' });

    queue.markSucceeded(created.id);
    queue.markFailed(created.id, 'stale failure', 10_000);

    const claimed = queue.claimNext();
    expect(claimed).toMatchObject({
      id: created.id,
      status: 'running',
      attemptCount: 1,
      lastError: null,
    });

    queue.markSucceeded(created.id);
    queue.markFailed(created.id, 'late stale failure', 20_000);

    const refreshed = queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-5' });
    expect(refreshed).toMatchObject({
      id: created.id,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
    });
  });
});
