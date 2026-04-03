import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createHostImportUseCase, persistImportedSessions } from '../../src/application/hosts/import-host.js';
import { KeyManager } from '../../src/crypto/keys.js';
import { CorivoDatabase } from '@/storage/database';
import { RawMemoryRepository } from '../../src/raw-memory/repository.js';
import { MemoryProcessingJobQueue } from '../../src/raw-memory/job-queue.js';
import { createEnqueueSessionExtractionUseCase } from '../../src/application/memory-ingest/enqueue-session-extraction.js';

describe('host import use case', () => {
  const dbPaths = new Set<string>();

  function createLogger() {
    return {
      debug: vi.fn(),
      isDebugEnabled: () => true,
    };
  }

  afterEach(async () => {
    for (const dbPath of dbPaths) {
      const instance = (CorivoDatabase as any).instances?.get(dbPath);
      instance?.close();
      (CorivoDatabase as any).instances?.delete(dbPath);

      await Promise.all([
        fs.unlink(dbPath).catch(() => {}),
        fs.unlink(`${dbPath}-shm`).catch(() => {}),
        fs.unlink(`${dbPath}-wal`).catch(() => {}),
      ]);
    }

    dbPaths.clear();
  });

  it('fails without --all or stored cursor on first import', async () => {
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory: vi.fn(),
        }) as any,
      getLastCursor: async () => undefined,
    });

    await expect(run({ host: 'claude-code' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('No previous import cursor found'),
    });
  });

  it('uses stored cursor when no explicit mode is provided', async () => {
    const importHistory = vi.fn(async () => ({
      success: true,
      host: 'claude-code',
      mode: 'incremental',
      importedSessionCount: 2,
      importedMessageCount: 6,
      nextCursor: 'cursor-2',
      summary: 'imported 2 sessions',
    }));
    const logger = createLogger();

    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory,
        }) as any,
      getLastCursor: async () => 'cursor-1',
      saveLastCursor: async () => {},
      logger,
    });

    await run({ host: 'claude-code' });

    expect(importHistory).toHaveBeenCalledWith(expect.objectContaining({ since: 'cursor-1' }));
    expect(logger.debug).toHaveBeenCalledWith(
      '[host:import] using stored cursor host=claude-code since=cursor-1'
    );
    expect(logger.debug).toHaveBeenCalledWith(
      '[host:import] completed host=claude-code mode=incremental sessions=2 messages=6 nextCursor=cursor-2 dryRun=false persisted=true cursorSaved=true'
    );
  });

  it('persists nextCursor when import succeeds with a cursor', async () => {
    const saveLastCursor = vi.fn(async () => {});
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory: vi.fn(async () => ({
            success: true,
            host: 'claude-code',
            mode: 'incremental',
            importedSessionCount: 1,
            importedMessageCount: 2,
            nextCursor: 'cursor-3',
            summary: 'ok',
          })),
        }) as any,
      getLastCursor: async () => 'cursor-2',
      saveLastCursor,
    });

    await run({ host: 'claude-code' });

    expect(saveLastCursor).toHaveBeenCalledWith('claude-code', 'cursor-3');
  });

  it('fails for unknown/unsupported host adapter', async () => {
    const run = createHostImportUseCase({
      getAdapter: () => null,
    });

    await expect(run({ host: 'codex' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Host import is not supported for codex'),
    });
  });

  it('fails when adapter does not implement importHistory', async () => {
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'codex',
        }) as any,
    });

    await expect(run({ host: 'codex' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Host import is not supported for codex'),
    });
  });

  it('bypasses cursor lookup when --all is explicitly set', async () => {
    const getLastCursor = vi.fn(async () => 'cursor-1');
    const importHistory = vi.fn(async () => ({
      success: true,
      host: 'claude-code',
      mode: 'full',
      importedSessionCount: 3,
      importedMessageCount: 9,
      summary: 'full import',
    }));
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory,
        }) as any,
      getLastCursor,
    });

    await run({ host: 'claude-code', all: true });

    expect(getLastCursor).not.toHaveBeenCalled();
    expect(importHistory).toHaveBeenCalledWith(expect.objectContaining({ all: true, since: undefined }));
  });

  it('does not persist cursor when import fails', async () => {
    const saveLastCursor = vi.fn(async () => {});
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory: vi.fn(async () => ({
            success: false,
            host: 'claude-code',
            mode: 'incremental',
            importedSessionCount: 0,
            importedMessageCount: 0,
            nextCursor: 'cursor-3',
            summary: 'failed',
            error: 'failed',
          })),
        }) as any,
      getLastCursor: async () => 'cursor-2',
      saveLastCursor,
    });

    await run({ host: 'claude-code' });

    expect(saveLastCursor).not.toHaveBeenCalled();
  });

  it('does not persist cursor when import succeeds in dry-run mode', async () => {
    const saveLastCursor = vi.fn(async () => {});
    const persistImportResult = vi.fn(async () => {});
    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory: vi.fn(async () => ({
            success: true,
            host: 'claude-code',
            mode: 'incremental',
            importedSessionCount: 1,
            importedMessageCount: 2,
            nextCursor: 'cursor-3',
            summary: 'ok',
          })),
        }) as any,
      getLastCursor: async () => 'cursor-2',
      saveLastCursor,
      persistImportResult,
    });

    await run({ host: 'claude-code', dryRun: true });

    expect(persistImportResult).not.toHaveBeenCalled();
    expect(saveLastCursor).not.toHaveBeenCalled();
  });

  it('writes imported sessions into raw storage and enqueues extraction jobs', async () => {
    const dbPath = `/tmp/corivo-host-import-${Math.random().toString(36).slice(2, 10)}.db`;
    dbPaths.add(dbPath);
    const db = CorivoDatabase.getInstance({
      path: dbPath,
      key: KeyManager.generateDatabaseKey(),
    });
    const repository = new RawMemoryRepository(db);
    const queue = new MemoryProcessingJobQueue(db);
    const enqueueSessionExtraction = createEnqueueSessionExtractionUseCase({ queue });

    const run = createHostImportUseCase({
      getAdapter: () =>
        ({
          id: 'claude-code',
          importHistory: vi.fn(async () => ({
            success: true,
            host: 'claude-code',
            mode: 'incremental',
            importedSessionCount: 1,
            importedMessageCount: 2,
            nextCursor: 'cursor-9',
            summary: 'ok',
            sessions: [
              {
                host: 'claude-code',
                externalSessionId: 'claude-session-1',
                cursor: 'cursor-9',
                startedAt: 1_710_000_100_000,
                endedAt: 1_710_000_100_200,
                messages: [
                  {
                    externalMessageId: 'msg-user-1',
                    role: 'user',
                    content: 'Please remember the Postgres decision.',
                    createdAt: 1_710_000_100_050,
                  },
                  {
                    externalMessageId: 'msg-assistant-1',
                    role: 'assistant',
                    content: 'We kept PostgreSQL because of JSON support.',
                    createdAt: 1_710_000_100_150,
                  },
                ],
                sourcePath: '/tmp/claude-session-1.json',
              },
            ],
          })),
        }) as any,
      getLastCursor: async () => 'cursor-8',
      saveLastCursor: async () => {},
      persistImportResult: async (result) => {
        await persistImportedSessions(result, {
          repository,
          enqueueSessionExtraction,
        });
      },
    });

    await run({ host: 'claude-code' });

    expect(repository.getTranscript('claude-code:claude-session-1')).toMatchObject({
      session: {
        host: 'claude-code',
        externalSessionId: 'claude-session-1',
        sessionKey: 'claude-code:claude-session-1',
        sourceType: 'history-import',
        lastImportCursor: 'cursor-9',
        lastMessageAt: 1_710_000_100_150,
      },
      messages: [
        {
          externalMessageId: 'msg-user-1',
          role: 'user',
          ordinal: 1,
          ingestedFrom: 'host-import',
        },
        {
          externalMessageId: 'msg-assistant-1',
          role: 'assistant',
          ordinal: 2,
          ingestedFrom: 'host-import',
        },
      ],
    });
    expect(queue.listPending()).toEqual([
      expect.objectContaining({
        host: 'claude-code',
        sessionKey: 'claude-code:claude-session-1',
        status: 'pending',
      }),
    ]);
  });
});
