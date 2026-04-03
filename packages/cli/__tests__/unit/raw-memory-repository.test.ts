import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { CorivoDatabase } from '@/storage/database';
import { KeyManager } from '../../src/crypto/keys.js';
import { RawMemoryRepository } from '../../src/raw-memory/repository.js';
import { HostImportCursorStore } from '../../src/raw-memory/import-cursors.js';

describe('RawMemoryRepository', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let repository: RawMemoryRepository;
  let cursors: HostImportCursorStore;

  beforeEach(async () => {
    const randomId = Math.random().toString(36).slice(2, 10);
    dbPath = `/tmp/corivo-raw-memory-${randomId}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    repository = new RawMemoryRepository(db);
    cursors = new HostImportCursorStore(db);
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

  it('upserts a raw session and message idempotently', () => {
    repository.upsertSession({
      host: 'claude-code',
      externalSessionId: 'sess-1',
      sessionKey: 'claude-code:sess-1',
      sourceType: 'history-import',
    });
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
      externalMessageId: 'msg-1',
      role: 'user',
      content: 'remember this',
      ordinal: 1,
      ingestedFrom: 'host-import',
    });

    expect(repository.listMessages('claude-code:sess-1')).toHaveLength(1);
  });

  it('keeps one logical message when re-ingested later with an external message id', () => {
    repository.upsertSession({
      host: 'codex',
      externalSessionId: 'sess-9',
      sessionKey: 'codex:sess-9',
      sourceType: 'realtime-hook',
    });

    repository.upsertMessage({
      sessionKey: 'codex:sess-9',
      role: 'assistant',
      content: 'same logical message',
      ordinal: 2,
      ingestedFrom: 'hook-stop',
    });

    repository.upsertMessage({
      sessionKey: 'codex:sess-9',
      externalMessageId: 'msg-9',
      role: 'assistant',
      content: 'same logical message',
      ordinal: 2,
      ingestedFrom: 'host-import',
    });

    expect(repository.listMessages('codex:sess-9')).toEqual([
      expect.objectContaining({
        sessionKey: 'codex:sess-9',
        externalMessageId: 'msg-9',
        role: 'assistant',
        content: 'same logical message',
        ordinal: 2,
      }),
    ]);
  });

  it('stores raw messages with empty string content losslessly', () => {
    repository.upsertSession({
      host: 'claude-code',
      externalSessionId: 'sess-empty',
      sessionKey: 'claude-code:sess-empty',
      sourceType: 'realtime-hook',
    });

    repository.upsertMessage({
      sessionKey: 'claude-code:sess-empty',
      externalMessageId: 'msg-empty',
      role: 'assistant',
      content: '',
      ordinal: 1,
      ingestedFrom: 'hook-stop',
    });

    expect(repository.listMessages('claude-code:sess-empty')).toEqual([
      expect.objectContaining({
        sessionKey: 'claude-code:sess-empty',
        externalMessageId: 'msg-empty',
        role: 'assistant',
        content: '',
        ordinal: 1,
      }),
    ]);
  });

  it('lists messages in transcript order and returns the full transcript', () => {
    repository.upsertSession({
      host: 'codex',
      externalSessionId: 'sess-7',
      sessionKey: 'codex:sess-7',
      sourceType: 'realtime-hook',
      projectIdentity: 'project-a',
    });

    repository.upsertMessage({
      sessionKey: 'codex:sess-7',
      externalMessageId: 'msg-2',
      role: 'assistant',
      content: 'second',
      ordinal: 2,
      ingestedFrom: 'hook-stop',
    });
    repository.upsertMessage({
      sessionKey: 'codex:sess-7',
      externalMessageId: 'msg-1',
      role: 'user',
      content: 'first',
      ordinal: 1,
      ingestedFrom: 'hook-submit',
    });
    repository.upsertMessage({
      sessionKey: 'codex:sess-7',
      role: 'assistant',
      content: 'third',
      ordinal: 3,
      ingestedFrom: 'hook-stop',
    });

    expect(repository.listMessages('codex:sess-7').map((message) => message.ordinal)).toEqual([1, 2, 3]);

    expect(repository.getTranscript('codex:sess-7')).toMatchObject({
      session: expect.objectContaining({
        host: 'codex',
        sessionKey: 'codex:sess-7',
        projectIdentity: 'project-a',
      }),
      messages: [
        expect.objectContaining({ ordinal: 1, content: 'first', role: 'user' }),
        expect.objectContaining({ ordinal: 2, content: 'second', role: 'assistant' }),
        expect.objectContaining({ ordinal: 3, content: 'third', role: 'assistant' }),
      ],
    });
  });

  it('stores import cursors per host', () => {
    expect(cursors.get('claude-code')).toBeNull();

    cursors.set('claude-code', 'cursor-1');
    cursors.set('codex', 'cursor-9');

    expect(cursors.get('claude-code')).toBe('cursor-1');
    expect(cursors.get('codex')).toBe('cursor-9');

    cursors.set('claude-code', 'cursor-2');
    expect(cursors.get('claude-code')).toBe('cursor-2');
  });
});
