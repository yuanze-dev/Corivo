import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { CorivoDatabase } from '../../src/storage/database.js';
import { KeyManager } from '../../src/crypto/keys.js';
import { Heartbeat } from '../../src/engine/heartbeat.js';
import * as memoryCommand from '../../src/cli/commands/memory.js';

describe('Heartbeat memory pipeline trigger', () => {
  let db: CorivoDatabase;
  let dbPath: string;
  let heartbeat: Heartbeat;

  beforeEach(async () => {
    dbPath = `/tmp/corivo-memory-pipeline-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.db`;
    const dbKey = KeyManager.generateDatabaseKey();

    const sqliteDb = new Database(dbPath);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        annotation TEXT DEFAULT 'pending',
        refs TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        status TEXT DEFAULT 'active',
        vitality INTEGER DEFAULT 100,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        pattern TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
    sqliteDb.close();

    db = CorivoDatabase.getInstance({ path: dbPath, key: dbKey });
    heartbeat = new Heartbeat({ db });
  });

  afterEach(async () => {
    CorivoDatabase.closeAll();
    db.close();
    await fs.unlink(dbPath).catch(() => {});
    vi.restoreAllMocks();
  });

  it('triggers the scheduled memory pipeline on cadence', async () => {
    const runnerSpy = vi
      .spyOn(memoryCommand, 'runMemoryPipeline')
      .mockResolvedValue({
        runId: 'run-memory-cadence',
        pipelineId: 'scheduled-memory-pipeline',
        status: 'success',
        stages: [],
      });

    const sleepSpy = vi.spyOn(heartbeat as any, 'sleep').mockResolvedValue();

    const cadence = (heartbeat as any).memoryPipelineCycles as number;
    (heartbeat as any).cycleCount = cadence - 1;
    (heartbeat as any).running = true;

    const runPromise = (heartbeat as any).run();

    for (let attempt = 0; attempt < 200 && runnerSpy.mock.calls.length === 0; attempt++) {
      await Promise.resolve();
    }

    (heartbeat as any).running = false;
    await runPromise;

    expect(runnerSpy).toHaveBeenCalledTimes(1);
    expect(runnerSpy).toHaveBeenCalledWith(
      'incremental',
      expect.objectContaining({
        createTrigger: expect.any(Function),
      }),
    );

    const trigger = runnerSpy.mock.calls[0]?.[1]?.createTrigger?.('incremental');
    expect(trigger).toMatchObject({
      type: 'scheduled',
      requestedBy: 'heartbeat',
    });

    runnerSpy.mockRestore();
    sleepSpy.mockRestore();
  });
});
