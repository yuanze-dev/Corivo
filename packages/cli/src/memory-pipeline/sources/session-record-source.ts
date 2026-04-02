import type { SessionRecord } from '../contracts/session-record.js';
import type { WorkItem } from '../types.js';

export type SessionRecordSourceMode = 'full' | 'incremental';

export interface SessionRecordQuery {
  mode?: SessionRecordSourceMode;
  sessionKind?: string;
}

export type SessionRecordWorkItem = WorkItem & {
  kind: 'session';
  metadata: {
    session: SessionRecord;
  };
};

export interface SessionRecordRepository {
  querySessionRecords: (
    query?: SessionRecordQuery,
  ) => Promise<SessionRecord[]> | SessionRecord[];
}

export interface DatabaseSessionRecordSourceConfig {
  repository: SessionRecordRepository;
  mode?: SessionRecordSourceMode;
  sessionKind?: string;
}

export class DatabaseSessionRecordSource {
  private readonly mode: SessionRecordSourceMode;

  constructor(private readonly config: DatabaseSessionRecordSourceConfig) {
    this.mode = config.mode ?? 'full';
  }

  async collect(): Promise<SessionRecordWorkItem[]> {
    const query: SessionRecordQuery = {
      mode: this.mode,
      ...(this.config.sessionKind ? { sessionKind: this.config.sessionKind } : {}),
    };
    const records = await Promise.resolve(this.config.repository.querySessionRecords(query));

    return records.map((session) => {
      const fallbackFreshness =
        session.updatedAt ?? session.endedAt ?? session.createdAt ?? session.startedAt;
      const freshnessToken =
        fallbackFreshness !== undefined ? String(fallbackFreshness) : undefined;

      return {
        id: session.id,
        kind: 'session',
        sourceRef: session.sourceRef,
        freshnessToken,
        metadata: {
          session,
        },
      };
    });
  }
}
