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
    heartbeat = new Heartbeat({ db, dbPath });
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

    const sleepSpy = vi.spyOn(heartbeat as any, 'sleep').mockImplementation(async () => {
      (heartbeat as any).running = false;
    });

    const cadence = (heartbeat as any).memoryPipelineCycles as number;
    (heartbeat as any).cycleCount = cadence - 1;
    (heartbeat as any).running = true;

    const runPromise = (heartbeat as any).run();

    for (let attempt = 0; attempt < 200 && runnerSpy.mock.calls.length === 0; attempt++) {
      await Promise.resolve();
    }
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
    expect(runnerSpy.mock.calls[0]?.[1]?.resolveDatabasePath?.()).toBe(dbPath);
    expect(runnerSpy.mock.calls[0]?.[1]?.createSessionSource).toBeUndefined();
    expect(runnerSpy.mock.calls[0]?.[1]?.openDatabase).toBeUndefined();

    runnerSpy.mockRestore();
    sleepSpy.mockRestore();
  });

  it('starts the scheduled pipeline without awaiting completion', async () => {
    let resolvePipeline: (() => void) | undefined;
    const runnerSpy = vi.spyOn(memoryCommand, 'runMemoryPipeline').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePipeline = () => resolve({
            runId: 'run-memory-slow',
            pipelineId: 'scheduled-memory-pipeline',
            status: 'success',
            stages: [],
          });
        }),
    );

    const result = (heartbeat as any).triggerScheduledMemoryPipeline();

    for (let attempt = 0; attempt < 200 && runnerSpy.mock.calls.length === 0; attempt++) {
      await Promise.resolve();
    }

    expect(result).toBeUndefined();
    expect(runnerSpy).toHaveBeenCalledTimes(1);
    expect((heartbeat as any).memoryPipelineRunning).toBe(true);

    resolvePipeline?.();
    for (let attempt = 0; attempt < 200 && (heartbeat as any).memoryPipelineRunning; attempt++) {
      await Promise.resolve();
    }
    expect((heartbeat as any).memoryPipelineRunning).toBe(false);

    runnerSpy.mockRestore();
  });

  it('skips scheduled memory pipeline when no db path is available', async () => {
    const localHeartbeat = new Heartbeat({ db });
    const runnerSpy = vi.spyOn(memoryCommand, 'runMemoryPipeline').mockResolvedValue({
      runId: 'run-memory-missing-db',
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
      stages: [],
    });
    const loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    (localHeartbeat as any).cycleCount = (localHeartbeat as any).memoryPipelineCycles;
    (localHeartbeat as any).triggerScheduledMemoryPipeline();

    expect(runnerSpy).not.toHaveBeenCalled();
    expect((localHeartbeat as any).memoryPipelineRunning).toBe(false);

    runnerSpy.mockRestore();
    loggerSpy.mockRestore();
  });

  it('waits for an in-flight scheduled pipeline during stop', async () => {
    let resolvePipeline: (() => void) | undefined;
    const runnerSpy = vi.spyOn(memoryCommand, 'runMemoryPipeline').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePipeline = () => resolve({
            runId: 'run-memory-stop',
            pipelineId: 'scheduled-memory-pipeline',
            status: 'success',
            stages: [],
          });
        }),
    );

    (heartbeat as any).triggerScheduledMemoryPipeline();
    const stopPromise = heartbeat.stop();

    let settled = false;
    void stopPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(runnerSpy).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolvePipeline?.();
    await stopPromise;

    expect(settled).toBe(true);
    runnerSpy.mockRestore();
  });

  it('does not trigger a scheduled pipeline after stop has begun', async () => {
    const runnerSpy = vi.spyOn(memoryCommand, 'runMemoryPipeline').mockResolvedValue({
      runId: 'run-memory-stop-race',
      pipelineId: 'scheduled-memory-pipeline',
      status: 'success',
      stages: [],
    });

    (heartbeat as any).cycleCount = (heartbeat as any).memoryPipelineCycles - 1;
    (heartbeat as any).running = false;

    expect((heartbeat as any).shouldTriggerMemoryPipeline()).toBe(false);
    expect(runnerSpy).not.toHaveBeenCalled();
    runnerSpy.mockRestore();
  });
});
