import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { KeyManager } from '../../src/infrastructure/crypto/keys.js';
import { CorivoDatabase } from '@/infrastructure/storage/facade/database';
import { RawMemoryRepository } from '../../src/infrastructure/storage/repositories/raw-memory-repository.js';
import { MemoryProcessingJobQueue } from '../../src/infrastructure/storage/repositories/memory-processing-job-queue.js';
import { createEnqueueSessionExtractionUseCase } from '../../src/application/memory-ingest/enqueue-session-extraction.js';
import { createIngestRealtimeMessageUseCase } from '../../src/application/memory-ingest/ingest-realtime-message.js';

describe('realtime memory ingest', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let repository: RawMemoryRepository;
  let queue: MemoryProcessingJobQueue;

  beforeEach(() => {
    const randomId = Math.random().toString(36).slice(2, 10);
    dbPath = `/tmp/corivo-realtime-ingest-${randomId}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    repository = new RawMemoryRepository(db);
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

  it('stores user prompt submit and assistant stop in raw memory while keeping one pending extraction job', async () => {
    const enqueueSessionExtraction = createEnqueueSessionExtractionUseCase({ queue });
    const ingestRealtimeMessage = createIngestRealtimeMessageUseCase({
      repository,
      enqueueSessionExtraction,
      now: () => 1_710_000_000_000,
    });

    await ingestRealtimeMessage({
      host: 'codex',
      externalSessionId: 'session-123',
      role: 'user',
      content: 'Remember the logging retention constraint.',
      createdAt: 1_710_000_000_100,
      projectIdentity: '/workspace/corivo',
      ingestedFrom: 'codex-user-prompt-submit',
      ingestEventId: 'evt-user-1',
    });

    expect(repository.getTranscript('codex:session-123')).toMatchObject({
      session: {
        host: 'codex',
        externalSessionId: 'session-123',
        sessionKey: 'codex:session-123',
        sourceType: 'realtime-hook',
        projectIdentity: '/workspace/corivo',
        startedAt: 1_710_000_000_100,
        lastMessageAt: 1_710_000_000_100,
      },
      messages: [
        {
          role: 'user',
          content: 'Remember the logging retention constraint.',
          ordinal: 1,
          ingestedFrom: 'codex-user-prompt-submit',
        },
      ],
    });
    expect(queue.listPending()).toHaveLength(1);
    expect(queue.listPending()[0]).toMatchObject({
      host: 'codex',
      sessionKey: 'codex:session-123',
      status: 'pending',
      dedupeKey: 'extract-session:codex:session-123',
    });

    await ingestRealtimeMessage({
      host: 'codex',
      externalSessionId: 'session-123',
      role: 'assistant',
      content: 'I will keep the logging retention constraint in mind.',
      createdAt: 1_710_000_000_200,
      projectIdentity: '/workspace/corivo',
      ingestedFrom: 'codex-stop',
      ingestEventId: 'evt-assistant-1',
    });

    expect(repository.getTranscript('codex:session-123')).toMatchObject({
      session: {
        host: 'codex',
        externalSessionId: 'session-123',
        sessionKey: 'codex:session-123',
        lastMessageAt: 1_710_000_000_200,
      },
      messages: [
        {
          role: 'user',
          content: 'Remember the logging retention constraint.',
          ordinal: 1,
        },
        {
          role: 'assistant',
          content: 'I will keep the logging retention constraint in mind.',
          ordinal: 2,
          ingestedFrom: 'codex-stop',
        },
      ],
    });
    expect(queue.listPending()).toHaveLength(1);
    expect(queue.listPending()[0]).toMatchObject({
      host: 'codex',
      sessionKey: 'codex:session-123',
      status: 'pending',
    });
  });

  it('uses the same fallback timestamp for raw messages and session lastMessageAt when createdAt is absent', async () => {
    const enqueueSessionExtraction = createEnqueueSessionExtractionUseCase({ queue });
    const ingestRealtimeMessage = createIngestRealtimeMessageUseCase({
      repository,
      enqueueSessionExtraction,
      now: () => 1_710_000_123_456,
    });

    await ingestRealtimeMessage({
      host: 'claude-code',
      externalSessionId: 'session-no-created-at',
      role: 'assistant',
      content: 'No explicit timestamp was provided.',
      ingestedFrom: 'claude-stop',
      ingestEventId: 'evt-assistant-no-created-at',
    });

    expect(repository.getTranscript('claude-code:session-no-created-at')).toMatchObject({
      session: {
        host: 'claude-code',
        sessionKey: 'claude-code:session-no-created-at',
        startedAt: 1_710_000_123_456,
        lastMessageAt: 1_710_000_123_456,
      },
      messages: [
        {
          role: 'assistant',
          content: 'No explicit timestamp was provided.',
          ordinal: 1,
          createdAt: 1_710_000_123_456,
          ingestedFrom: 'claude-stop',
        },
      ],
    });
  });
});
