import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { CorivoDatabase } from '@/storage/database';
import { KeyManager } from '../../src/crypto/keys.js';
import { MemoryProcessingJobQueue } from '../../src/infrastructure/storage/repositories/memory-processing-job-queue.js';
import { RawMemoryRepository } from '../../src/infrastructure/storage/repositories/raw-memory-repository.js';
import { DatabaseRawSessionJobSource } from '../../src/memory-pipeline/sources/raw-session-job-source.js';

describe('DatabaseRawSessionJobSource', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let queue: MemoryProcessingJobQueue;
  let repository: RawMemoryRepository;
  let source: DatabaseRawSessionJobSource;

  beforeEach(async () => {
    const randomId = Math.random().toString(36).slice(2, 10);
    dbPath = `/tmp/corivo-raw-session-job-source-${randomId}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    queue = new MemoryProcessingJobQueue(db);
    repository = new RawMemoryRepository(db);
    source = new DatabaseRawSessionJobSource({ queue, repository });
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

  it('claims pending extract-session jobs and loads full transcripts', async () => {
    repository.upsertSession({
      host: 'claude-code',
      externalSessionId: 'sess-1',
      sessionKey: 'claude-code:sess-1',
      sourceType: 'history-import',
    });
    repository.upsertMessage({
      sessionKey: 'claude-code:sess-1',
      externalMessageId: 'msg-1',
      role: 'user',
      content: 'remember this',
      ordinal: 1,
      ingestedFrom: 'host-import',
    });
    repository.upsertMessage({
      sessionKey: 'claude-code:sess-1',
      externalMessageId: 'msg-2',
      role: 'assistant',
      content: 'noted',
      ordinal: 2,
      ingestedFrom: 'host-import',
    });
    queue.ensureExtractSessionJob({ host: 'claude-code', sessionKey: 'claude-code:sess-1' });

    const items = await source.collect();

    expect(items).toEqual([
      expect.objectContaining({
        sessionKey: 'claude-code:sess-1',
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'remember this' }),
          expect.objectContaining({ role: 'assistant', content: 'noted' }),
        ]),
      }),
    ]);
  });

  it('exposes success and failure acknowledgements for claimed jobs', async () => {
    repository.upsertSession({
      host: 'codex',
      externalSessionId: 'sess-2',
      sessionKey: 'codex:sess-2',
      sourceType: 'realtime-hook',
    });
    repository.upsertMessage({
      sessionKey: 'codex:sess-2',
      role: 'user',
      content: 'test retry',
      ordinal: 1,
      ingestedFrom: 'hook',
    });
    const job = queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:sess-2' });

    await source.collect();
    await source.markFailed(job.id, 'temporary failure', Date.now());

    const retried = await source.collect();
    expect(retried).toHaveLength(1);
    await source.markSucceeded(retried[0].job.id);

    expect(queue.listPending()).toHaveLength(0);
    expect(queue.claimNext()).toBeNull();
  });

  it('requeues missing transcripts for retry instead of terminal failure', async () => {
    queue.ensureExtractSessionJob({ host: 'codex', sessionKey: 'codex:missing-session' });

    const items = await source.collect();

    expect(items).toHaveLength(0);
    const pending = queue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sessionKey: 'codex:missing-session',
      status: 'pending',
      attemptCount: 1,
    });
    expect(typeof pending[0].lastError).toBe('string');
    expect(pending[0].lastError).toContain('Raw transcript not found');
    expect(pending[0].availableAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('requeues a claimed job when transcript loading throws and continues collecting later jobs', async () => {
    const queueStub = {
      claimNext: vi
        .fn()
        .mockReturnValueOnce({
          id: 'job-error',
          host: 'codex',
          sessionKey: 'codex:sess-error',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:codex:sess-error',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        })
        .mockReturnValueOnce({
          id: 'job-ok',
          host: 'codex',
          sessionKey: 'codex:sess-ok',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:codex:sess-ok',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        })
        .mockReturnValueOnce(null),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    const repositoryStub = {
      getTranscript: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('db read failed');
        })
        .mockReturnValueOnce({
          session: {
            id: 'raw-session-ok',
            host: 'codex',
            externalSessionId: 'sess-ok',
            sessionKey: 'codex:sess-ok',
            sourceType: 'realtime-hook',
            createdAt: 1,
            updatedAt: 2,
          },
          messages: [
            {
              id: 'msg-1',
              sessionKey: 'codex:sess-ok',
              role: 'user',
              content: 'hello',
              ordinal: 1,
              ingestedFrom: 'hook',
              createdDbAt: 1,
              updatedDbAt: 1,
            },
          ],
        }),
    };
    const sourceWithStubs = new DatabaseRawSessionJobSource({
      queue: queueStub as any,
      repository: repositoryStub as any,
    });

    const items = await sourceWithStubs.collect(2);

    expect(queueStub.markFailed).toHaveBeenCalledWith(
      'job-error',
      expect.stringContaining('db read failed'),
      expect.any(Number),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sessionKey: 'codex:sess-ok',
    });
  });

  it('returns already collected jobs when a later claim throws', async () => {
    const queueStub = {
      claimNext: vi
        .fn()
        .mockReturnValueOnce({
          id: 'job-ok',
          host: 'codex',
          sessionKey: 'codex:sess-ok',
          jobType: 'extract-session',
          status: 'running',
          dedupeKey: 'extract-session:codex:sess-ok',
          priority: 0,
          attemptCount: 1,
          availableAt: 1,
          claimedAt: 1,
          finishedAt: null,
          lastError: null,
          payloadJson: null,
          createdAt: 1,
          updatedAt: 1,
        })
        .mockImplementationOnce(() => {
          throw new Error('claim failed');
        }),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    const repositoryStub = {
      getTranscript: vi.fn().mockReturnValue({
        session: {
          id: 'raw-session-ok',
          host: 'codex',
          externalSessionId: 'sess-ok',
          sessionKey: 'codex:sess-ok',
          sourceType: 'realtime-hook',
          createdAt: 1,
          updatedAt: 2,
        },
        messages: [
          {
            id: 'msg-1',
            sessionKey: 'codex:sess-ok',
            role: 'user',
            content: 'hello',
            ordinal: 1,
            ingestedFrom: 'hook',
            createdDbAt: 1,
            updatedDbAt: 1,
          },
        ],
      }),
    };
    const sourceWithStubs = new DatabaseRawSessionJobSource({
      queue: queueStub as any,
      repository: repositoryStub as any,
    });

    await expect(sourceWithStubs.collect(2)).resolves.toMatchObject([
      {
        sessionKey: 'codex:sess-ok',
      },
    ]);
  });
});
