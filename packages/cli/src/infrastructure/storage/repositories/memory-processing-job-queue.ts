import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@/errors';
import type { CorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import type {
  EnsureExtractSessionJobInput,
  MemoryProcessingJobRecord,
} from '@/raw-memory/types.js';

interface StorageSqliteDb {
  prepare(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

export class MemoryProcessingJobQueue {
  private readonly sqliteDb: StorageSqliteDb | null;
  private readonly facadeDb: CorivoDatabase | null;
  private readonly rowMapper: ((row: unknown) => MemoryProcessingJobRecord) | null;

  constructor(
    db: StorageSqliteDb | CorivoDatabase,
    rowToMemoryProcessingJob?: (row: unknown) => MemoryProcessingJobRecord,
  ) {
    if (this.isSqliteDb(db)) {
      this.sqliteDb = db;
      this.facadeDb = null;
      this.rowMapper = rowToMemoryProcessingJob ?? null;
      return;
    }

    this.sqliteDb = null;
    this.facadeDb = db;
    this.rowMapper = null;
  }

  ensureExtractSessionJob(input: EnsureExtractSessionJobInput): MemoryProcessingJobRecord {
    if (this.facadeDb) {
      return this.facadeDb.ensureExtractSessionProcessingJob(input);
    }
    if (!input.host || !input.sessionKey) {
      throw new DatabaseError('Memory processing job 缺少必填字段');
    }

    const now = Date.now();
    const dedupeKey = `extract-session:${input.sessionKey}`;
    const existing = this.getSqliteDb().prepare(`
      SELECT *
      FROM memory_processing_jobs
      WHERE dedupe_key = ?
      LIMIT 1
    `).get(dedupeKey) as any;
    const isTerminal = existing
      ? existing.status === 'succeeded' || existing.status === 'failed' || existing.status === 'cancelled'
      : false;

    const record: MemoryProcessingJobRecord = {
      id: existing?.id ?? `job_${randomUUID()}`,
      host: input.host,
      sessionKey: input.sessionKey,
      jobType: 'extract-session',
      status: 'pending',
      dedupeKey,
      priority: input.priority ?? existing?.priority ?? 0,
      attemptCount: isTerminal ? 0 : (existing?.attempt_count ?? 0),
      availableAt: input.availableAt ?? now,
      claimedAt: null,
      finishedAt: null,
      lastError: null,
      payloadJson: existing?.payload_json ?? null,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };

    this.getSqliteDb().prepare(`
      INSERT INTO memory_processing_jobs (
        id, host, session_key, job_type, status, dedupe_key, priority, attempt_count,
        available_at, claimed_at, finished_at, last_error, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        host = excluded.host,
        session_key = excluded.session_key,
        job_type = excluded.job_type,
        status = excluded.status,
        priority = excluded.priority,
        available_at = excluded.available_at,
        claimed_at = excluded.claimed_at,
        finished_at = excluded.finished_at,
        last_error = excluded.last_error,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.host,
      record.sessionKey,
      record.jobType,
      record.status,
      record.dedupeKey,
      record.priority,
      record.attemptCount,
      record.availableAt,
      record.claimedAt,
      record.finishedAt,
      record.lastError,
      record.payloadJson,
      record.createdAt,
      record.updatedAt,
    );

    return record;
  }

  claimNext(now = Date.now()): MemoryProcessingJobRecord | null {
    if (this.facadeDb) {
      return this.facadeDb.claimNextMemoryProcessingJob(now);
    }
    const claim = this.getSqliteDb().transaction((claimedAt: number) => {
      const candidate = this.getSqliteDb().prepare(`
        SELECT *
        FROM memory_processing_jobs
        WHERE status = 'pending' AND available_at <= ?
        ORDER BY priority DESC, available_at ASC, created_at ASC
        LIMIT 1
      `).get(claimedAt) as any;

      if (!candidate) {
        return null;
      }

      const updatedAt = Date.now();
      const result = this.getSqliteDb().prepare(`
        UPDATE memory_processing_jobs
        SET
          status = 'running',
          attempt_count = attempt_count + 1,
          claimed_at = ?,
          updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(claimedAt, updatedAt, candidate.id);

      if (result.changes === 0) {
        return null;
      }

      return this.rowMapper?.({
        ...candidate,
        status: 'running',
        attempt_count: candidate.attempt_count + 1,
        claimed_at: claimedAt,
        updated_at: updatedAt,
      }) ?? null;
    });

    return claim(now);
  }

  listPending(): MemoryProcessingJobRecord[] {
    if (this.facadeDb) {
      return this.facadeDb.listPendingMemoryProcessingJobs();
    }
    const rows = this.getSqliteDb().prepare(`
      SELECT *
      FROM memory_processing_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, available_at ASC, created_at ASC
    `).all() as unknown[];

    return rows.map((row) => this.rowMapper?.(row)).filter((row): row is MemoryProcessingJobRecord => Boolean(row));
  }

  markSucceeded(id: string): void {
    if (this.facadeDb) {
      this.facadeDb.markMemoryProcessingJobSucceeded(id);
      return;
    }
    const now = Date.now();
    this.getSqliteDb().prepare(`
      UPDATE memory_processing_jobs
      SET
        status = 'succeeded',
        finished_at = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(now, now, id);
  }

  markFailed(id: string, error: string, nextAvailableAt?: number): void {
    if (this.facadeDb) {
      this.facadeDb.markMemoryProcessingJobFailed(id, error, nextAvailableAt);
      return;
    }
    const now = Date.now();

    if (nextAvailableAt !== undefined) {
      this.getSqliteDb().prepare(`
        UPDATE memory_processing_jobs
        SET
          status = 'pending',
          available_at = ?,
          claimed_at = NULL,
          finished_at = NULL,
          last_error = ?,
          updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(nextAvailableAt, error, now, id);
      return;
    }

    this.getSqliteDb().prepare(`
      UPDATE memory_processing_jobs
      SET
        status = 'failed',
        finished_at = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(now, error, now, id);
  }

  private isSqliteDb(value: StorageSqliteDb | CorivoDatabase): value is StorageSqliteDb {
    return 'prepare' in value && 'transaction' in value;
  }

  private getSqliteDb(): StorageSqliteDb {
    if (!this.sqliteDb) {
      throw new Error('MemoryProcessingJobQueue sqlite runtime is unavailable');
    }
    return this.sqliteDb;
  }
}
