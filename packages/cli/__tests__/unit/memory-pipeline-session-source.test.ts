import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyManager } from '../../src/infrastructure/crypto/keys.js';
import { DatabaseClaudeSessionSource } from '../../src/memory-pipeline/sources/claude-session-source.js';
import { DatabaseSessionRecordSource } from '../../src/memory-pipeline/sources/session-record-source.js';
import { CorivoDatabase } from '@/infrastructure/storage/facade/database';

describe('DatabaseSessionRecordSource', () => {
  let db: CorivoDatabase;
  let dbPath: string;

  beforeEach(() => {
    const randomId = Math.random().toString(36).slice(2, 10);
    dbPath = `/tmp/corivo-session-source-${randomId}.db`;
    db = CorivoDatabase.getInstance({
      path: dbPath,
      key: KeyManager.generateDatabaseKey(),
    });
  });

  afterEach(async () => {
    db.close();

    const instances = (CorivoDatabase as unknown as { instances?: Map<string, CorivoDatabase> })
      .instances;
    if (instances?.has(dbPath)) {
      instances.delete(dbPath);
    }

    await fs.unlink(dbPath).catch(() => {});
  });

  it('maps stored session records into normalized session work items', async () => {
    const sqlite = new Database(dbPath);
    sqlite.exec(`
      INSERT INTO session_records (
        id,
        kind,
        source_ref,
        created_at,
        updated_at,
        started_at,
        ended_at,
        metadata
      ) VALUES (
        'session_001',
        'claude-session',
        'claude://projects/demo/sessions/session_001',
        100,
        200,
        100,
        200,
        '{"workspace":"demo"}'
      );

      INSERT INTO session_messages (
        id,
        session_id,
        role,
        content,
        sequence,
        created_at,
        metadata
      ) VALUES
        (
          'message_002',
          'session_001',
          'assistant',
          'Here is the plan.',
          2,
          102,
          '{"turn":2}'
        ),
        (
          'message_001',
          'session_001',
          'user',
          'Need a migration plan.',
          1,
          101,
          '{"turn":1}'
        );
    `);
    sqlite.close();

    const source = new DatabaseSessionRecordSource({
      repository: db,
      mode: 'full',
    });

    await expect(source.collect()).resolves.toEqual([
      {
        id: 'session_001',
        kind: 'session',
        sourceRef: 'claude://projects/demo/sessions/session_001',
        freshnessToken: '200',
        metadata: {
          session: {
            id: 'session_001',
            sessionId: 'session_001',
            kind: 'claude-session',
            host: 'claude',
            sourceRef: 'claude://projects/demo/sessions/session_001',
            createdAt: 100,
            updatedAt: 200,
            startedAt: 100,
            endedAt: 200,
            metadata: {
              workspace: 'demo',
            },
            messages: [
              {
                id: 'message_001',
                role: 'user',
                content: 'Need a migration plan.',
                sequence: 1,
                createdAt: 101,
                metadata: {
                  turn: 1,
                },
              },
              {
                id: 'message_002',
                role: 'assistant',
                content: 'Here is the plan.',
                sequence: 2,
                createdAt: 102,
                metadata: {
                  turn: 2,
                },
              },
            ],
          },
        },
      },
    ]);
  });

  it('forwards incremental mode to the repository without source-level strategy leakage', async () => {
    const querySessionRecords = vi.fn(() => [
      {
        id: 'session_002',
        sessionId: 'session_002',
        kind: 'claude-session',
        host: 'claude',
        sourceRef: 'claude://session_002',
        createdAt: 300,
        startedAt: 300,
        messages: [],
      },
    ]);
    const source = new DatabaseSessionRecordSource({
      repository: { querySessionRecords },
      mode: 'incremental',
    });

    await expect(source.collect()).resolves.toEqual([
      {
        id: 'session_002',
        kind: 'session',
        sourceRef: 'claude://session_002',
        freshnessToken: '300',
        metadata: {
          session: {
            id: 'session_002',
            sessionId: 'session_002',
            kind: 'claude-session',
            host: 'claude',
            sourceRef: 'claude://session_002',
            createdAt: 300,
            startedAt: 300,
            messages: [],
          },
        },
      },
    ]);
    expect(querySessionRecords).toHaveBeenCalledWith({
      mode: 'incremental',
    });
  });

  it('does not hardcode a latest-100 incremental limit in the database adapter', async () => {
    const sqlite = new Database(dbPath);
    const insert = sqlite.prepare(`
      INSERT INTO session_records (
        id,
        kind,
        source_ref,
        created_at,
        updated_at,
        started_at,
        ended_at,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (let index = 0; index < 101; index += 1) {
      insert.run(
        `session_${String(index).padStart(3, '0')}`,
        'claude-session',
        `claude://session_${index}`,
        100 + index,
        100 + index,
        100 + index,
        100 + index,
        '{}',
      );
    }
    sqlite.close();

    const source = new DatabaseSessionRecordSource({
      repository: db,
      mode: 'incremental',
    });

    await expect(source.collect()).resolves.toHaveLength(101);
  });

  it('filters Claude collection to claude-session rows at the database boundary', async () => {
    const sqlite = new Database(dbPath);
    sqlite.exec(`
      INSERT INTO session_records (
        id,
        kind,
        source_ref,
        created_at,
        updated_at,
        started_at,
        ended_at,
        metadata
      ) VALUES
        ('claude_001', 'claude-session', 'claude://claude_001', 100, 200, 100, 200, '{}'),
        ('cursor_001', 'cursor-session', 'cursor://cursor_001', 100, 300, 100, 300, '{}');
    `);
    sqlite.close();

    const source = new DatabaseClaudeSessionSource({
      repository: db,
      mode: 'full',
    });

    await expect(source.collect()).resolves.toEqual([
      {
        id: 'claude_001',
        kind: 'session',
        sourceRef: 'claude://claude_001',
        freshnessToken: '200',
        metadata: {
          session: {
            id: 'claude_001',
            sessionId: 'claude_001',
            kind: 'claude-session',
            host: 'claude',
            sourceRef: 'claude://claude_001',
            createdAt: 100,
            updatedAt: 200,
            startedAt: 100,
            endedAt: 200,
            messages: [],
          },
        },
      },
    ]);
  });
});
