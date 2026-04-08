import type { HostId } from '@/domain/host/contracts/types.js';
import type {
  RawMessageRecord,
  RawSessionRecord,
  RawTranscript,
} from '@/infrastructure/storage/types/raw-memory.js';
import type { SessionRecord } from '../contracts/session-record.js';
import type { WorkItem } from '../types.js';

export type RawSessionRecordWorkItem = WorkItem & {
  kind: 'session';
  metadata: {
    session: SessionRecord;
  };
};

export interface RawSessionRecordRepository {
  listRawSessions(): Promise<RawSessionRecord[]> | RawSessionRecord[];
  getRawTranscript(sessionKey: string): Promise<RawTranscript | null> | RawTranscript | null;
}

export interface DatabaseRawSessionRecordSourceConfig {
  repository: RawSessionRecordRepository;
}

export class DatabaseRawSessionRecordSource {
  constructor(private readonly config: DatabaseRawSessionRecordSourceConfig) {}

  async collect(): Promise<RawSessionRecordWorkItem[]> {
    const sessions = await Promise.resolve(this.config.repository.listRawSessions());
    const items: RawSessionRecordWorkItem[] = [];

    for (const session of sessions) {
      const transcript = await Promise.resolve(this.config.repository.getRawTranscript(session.sessionKey));

      if (!transcript) {
        continue;
      }

      const normalized = this.toSessionRecord(transcript.session, transcript.messages);
      const freshness = transcript.session.updatedAt
        ?? transcript.session.lastMessageAt
        ?? transcript.session.endedAt
        ?? transcript.session.startedAt
        ?? transcript.session.createdAt;

      items.push({
        id: transcript.session.id,
        kind: 'session',
        sourceRef: transcript.session.sessionKey,
        freshnessToken: freshness !== undefined ? String(freshness) : undefined,
        metadata: {
          session: normalized,
        },
      });
    }

    return items;
  }

  private toSessionRecord(
    session: RawSessionRecord,
    messages: RawMessageRecord[],
  ): SessionRecord {
    return {
      id: session.id,
      sessionId: session.externalSessionId,
      kind: 'raw-session',
      host: session.host,
      sourceRef: session.sessionKey,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      metadata: {
        hostId: session.host,
        sourceType: session.sourceType,
        projectIdentity: session.projectIdentity,
        lastImportCursor: session.lastImportCursor,
      },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sequence: message.ordinal,
        createdAt: message.createdAt ?? message.createdDbAt,
        metadata: {
          externalMessageId: message.externalMessageId,
          ingestedFrom: message.ingestedFrom,
          ingestEventId: message.ingestEventId,
        },
      })),
    };
  }
}
