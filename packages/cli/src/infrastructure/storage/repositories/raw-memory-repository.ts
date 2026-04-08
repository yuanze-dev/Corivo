import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@/domain/errors/index.js';
import type { CorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import type {
  RawMessageInput,
  RawMessageRecord,
  RawSessionInput,
  RawSessionRecord,
  RawTranscript,
} from '@/infrastructure/storage/types/raw-memory.js';

interface StorageSqliteDb {
  prepare(sql: string): any;
}

interface RawMemoryRepositoryRuntime {
  db: StorageSqliteDb;
  rowToRawSession: (row: unknown) => RawSessionRecord;
  rowToRawMessage: (row: unknown) => RawMessageRecord;
}

export class RawMemoryRepository {
  private readonly runtime: RawMemoryRepositoryRuntime | null;
  private readonly facadeDb: CorivoDatabase | null;

  constructor(runtimeOrDb: RawMemoryRepositoryRuntime | CorivoDatabase) {
    if (this.isRuntime(runtimeOrDb)) {
      this.runtime = runtimeOrDb;
      this.facadeDb = null;
      return;
    }

    this.runtime = null;
    this.facadeDb = runtimeOrDb;
  }

  listSessions(): RawSessionRecord[] {
    if (this.facadeDb) {
      return this.facadeDb.listRawSessions();
    }
    const rows = this.getRuntime().db.prepare(`
      SELECT *
      FROM raw_sessions
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, updated_at DESC
    `).all() as unknown[];

    return rows.map((row) => this.getRuntime().rowToRawSession(row));
  }

  upsertSession(input: RawSessionInput): RawSessionRecord {
    if (this.facadeDb) {
      return this.facadeDb.upsertRawSession(input);
    }
    if (!input.host || !input.externalSessionId || !input.sessionKey || !input.sourceType) {
      throw new DatabaseError('Raw session 缺少必填字段');
    }

    const now = Date.now();
    const existing = this.getRuntime().db.prepare(`
      SELECT *
      FROM raw_sessions
      WHERE session_key = ?
         OR (host = ? AND external_session_id = ?)
      LIMIT 1
    `).get(input.sessionKey, input.host, input.externalSessionId) as any;

    const record: RawSessionRecord = {
      id: existing?.id ?? `raw_sess_${randomUUID()}`,
      host: input.host,
      externalSessionId: input.externalSessionId,
      sessionKey: input.sessionKey,
      sourceType: input.sourceType,
      projectIdentity: input.projectIdentity ?? existing?.project_identity ?? undefined,
      startedAt: input.startedAt ?? existing?.started_at ?? undefined,
      endedAt: input.endedAt ?? existing?.ended_at ?? undefined,
      lastMessageAt: input.lastMessageAt ?? existing?.last_message_at ?? undefined,
      lastImportCursor: input.lastImportCursor ?? existing?.last_import_cursor ?? undefined,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };

    if (existing) {
      this.getRuntime().db.prepare(`
        UPDATE raw_sessions
        SET
          host = ?,
          external_session_id = ?,
          session_key = ?,
          source_type = ?,
          project_identity = ?,
          started_at = ?,
          ended_at = ?,
          last_message_at = ?,
          last_import_cursor = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        record.host,
        record.externalSessionId,
        record.sessionKey,
        record.sourceType,
        record.projectIdentity ?? null,
        record.startedAt ?? null,
        record.endedAt ?? null,
        record.lastMessageAt ?? null,
        record.lastImportCursor ?? null,
        record.updatedAt,
        record.id,
      );
    } else {
      this.getRuntime().db.prepare(`
        INSERT INTO raw_sessions (
          id, host, external_session_id, session_key, source_type, project_identity,
          started_at, ended_at, last_message_at, last_import_cursor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.host,
        record.externalSessionId,
        record.sessionKey,
        record.sourceType,
        record.projectIdentity ?? null,
        record.startedAt ?? null,
        record.endedAt ?? null,
        record.lastMessageAt ?? null,
        record.lastImportCursor ?? null,
        record.createdAt,
        record.updatedAt,
      );
    }

    return record;
  }

  upsertMessage(input: RawMessageInput): RawMessageRecord {
    if (this.facadeDb) {
      return this.facadeDb.upsertRawMessage(input);
    }
    if (
      !input.sessionKey
      || !input.role
      || typeof input.content !== 'string'
      || !Number.isInteger(input.ordinal)
    ) {
      throw new DatabaseError('Raw message 缺少必填字段');
    }

    const now = Date.now();
    const existing = input.externalMessageId
      ? this.getRuntime().db.prepare(`
          SELECT *
          FROM raw_messages
          WHERE session_key = ?
            AND (
              external_message_id = ?
              OR (ordinal = ? AND role = ?)
            )
          ORDER BY CASE WHEN external_message_id = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).get(input.sessionKey, input.externalMessageId, input.ordinal, input.role, input.externalMessageId)
      : this.getRuntime().db.prepare(`
          SELECT *
          FROM raw_messages
          WHERE session_key = ? AND ordinal = ? AND role = ?
          LIMIT 1
        `).get(input.sessionKey, input.ordinal, input.role);

    const record: RawMessageRecord = {
      id: (existing as any)?.id ?? `raw_msg_${randomUUID()}`,
      sessionKey: input.sessionKey,
      externalMessageId: input.externalMessageId,
      role: input.role,
      content: input.content,
      ordinal: input.ordinal,
      createdAt: input.createdAt ?? (existing as any)?.created_at ?? undefined,
      ingestedFrom: input.ingestedFrom,
      ingestEventId: input.ingestEventId ?? (existing as any)?.ingest_event_id ?? undefined,
      createdDbAt: (existing as any)?.created_db_at ?? now,
      updatedDbAt: now,
    };

    if (existing) {
      this.getRuntime().db.prepare(`
        UPDATE raw_messages
        SET
          session_key = ?,
          external_message_id = ?,
          role = ?,
          content = ?,
          ordinal = ?,
          created_at = ?,
          ingested_from = ?,
          ingest_event_id = ?,
          updated_db_at = ?
        WHERE id = ?
      `).run(
        record.sessionKey,
        record.externalMessageId ?? null,
        record.role,
        record.content,
        record.ordinal,
        record.createdAt ?? null,
        record.ingestedFrom,
        record.ingestEventId ?? null,
        record.updatedDbAt,
        record.id,
      );
    } else {
      this.getRuntime().db.prepare(`
        INSERT INTO raw_messages (
          id, session_key, external_message_id, role, content, ordinal,
          created_at, ingested_from, ingest_event_id, created_db_at, updated_db_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.sessionKey,
        record.externalMessageId ?? null,
        record.role,
        record.content,
        record.ordinal,
        record.createdAt ?? null,
        record.ingestedFrom,
        record.ingestEventId ?? null,
        record.createdDbAt,
        record.updatedDbAt,
      );
    }

    return record;
  }

  listMessages(sessionKey: string): RawMessageRecord[] {
    if (this.facadeDb) {
      return this.facadeDb.listRawMessages(sessionKey);
    }
    const rows = this.getRuntime().db.prepare(`
      SELECT *
      FROM raw_messages
      WHERE session_key = ?
      ORDER BY ordinal ASC, COALESCE(created_at, created_db_at) ASC, created_db_at ASC
    `).all(sessionKey) as unknown[];

    return rows.map((row) => this.getRuntime().rowToRawMessage(row));
  }

  getTranscript(sessionKey: string): RawTranscript | null {
    if (this.facadeDb) {
      return this.facadeDb.getRawTranscript(sessionKey);
    }
    const session = this.getRuntime().db.prepare(`
      SELECT *
      FROM raw_sessions
      WHERE session_key = ?
    `).get(sessionKey);

    if (!session) {
      return null;
    }

    return {
      session: this.getRuntime().rowToRawSession(session),
      messages: this.listMessages(sessionKey),
    };
  }

  private isRuntime(value: RawMemoryRepositoryRuntime | CorivoDatabase): value is RawMemoryRepositoryRuntime {
    return 'db' in value && 'rowToRawSession' in value && 'rowToRawMessage' in value;
  }

  private getRuntime(): RawMemoryRepositoryRuntime {
    if (!this.runtime) {
      throw new Error('RawMemoryRepository runtime is unavailable');
    }
    return this.runtime;
  }
}
