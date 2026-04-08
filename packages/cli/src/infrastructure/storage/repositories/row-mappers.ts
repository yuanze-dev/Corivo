import { KeyManager } from '@/infrastructure/crypto/keys.js';
import type {
  Association,
  Block,
} from '@/domain/memory/models';
import { AssociationType } from '@/domain/memory/models/association.js';
import type { HostId } from '@/domain/host/contracts/types.js';
import type {
  MemoryProcessingJobRecord,
  RawMessageRecord,
  RawSessionRecord,
} from '@/infrastructure/storage/types/raw-memory.js';
import type { SessionMessage, SessionRecord } from '@/memory-pipeline/contracts/session-record.js';

interface BlockRowMapperRuntime {
  enableEncryption: boolean;
  useSQLCipher: boolean;
  getContentKey: () => Buffer;
}

export function mapRowToBlock(runtime: BlockRowMapperRuntime, row: any): Block {
  const content = (runtime.enableEncryption && !runtime.useSQLCipher)
    ? KeyManager.decryptContent(row.content, runtime.getContentKey())
    : row.content;

  return {
    id: row.id,
    content,
    annotation: row.annotation,
    refs: JSON.parse(row.refs || '[]'),
    source: row.source,
    vitality: row.vitality,
    status: row.status,
    access_count: row.access_count,
    last_accessed: row.last_accessed,
    pattern: row.pattern ? JSON.parse(row.pattern) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapRowToAssociation(row: any): Association {
  return {
    id: row.id,
    from_id: row.from_id,
    to_id: row.to_id,
    type: row.type as AssociationType,
    direction: row.direction,
    confidence: row.confidence,
    reason: row.reason,
    context_tags: row.context_tags ? JSON.parse(row.context_tags) : undefined,
    created_at: row.created_at,
  };
}

export function mapRowToRawSession(row: any): RawSessionRecord {
  return {
    id: row.id,
    host: row.host as HostId,
    externalSessionId: row.external_session_id,
    sessionKey: row.session_key,
    sourceType: row.source_type,
    projectIdentity: row.project_identity ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    lastImportCursor: row.last_import_cursor ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToRawMessage(row: any): RawMessageRecord {
  return {
    id: row.id,
    sessionKey: row.session_key,
    externalMessageId: row.external_message_id ?? undefined,
    role: row.role,
    content: row.content,
    ordinal: row.ordinal,
    createdAt: row.created_at ?? undefined,
    ingestedFrom: row.ingested_from,
    ingestEventId: row.ingest_event_id ?? undefined,
    createdDbAt: row.created_db_at,
    updatedDbAt: row.updated_db_at,
  };
}

export function mapRowToMemoryProcessingJob(row: any): MemoryProcessingJobRecord {
  return {
    id: row.id,
    host: row.host as HostId,
    sessionKey: row.session_key,
    jobType: row.job_type,
    status: row.status,
    dedupeKey: row.dedupe_key,
    priority: row.priority,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    claimedAt: row.claimed_at ?? null,
    finishedAt: row.finished_at ?? null,
    lastError: row.last_error ?? null,
    payloadJson: row.payload_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return Object.keys(record).length > 0 ? record : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function deriveSessionHost(kind: string, sourceRef: string): string {
  if (kind.endsWith('-session')) {
    return kind.slice(0, -'-session'.length);
  }

  const protocolSeparator = sourceRef.indexOf('://');
  if (protocolSeparator > 0) {
    return sourceRef.slice(0, protocolSeparator);
  }

  return 'unknown';
}

export function mapRowToSessionMessage(row: any): SessionMessage {
  const metadata = parseJsonObject(row.metadata);

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sequence: row.sequence,
    createdAt: row.created_at ?? undefined,
    ...(metadata ? { metadata } : {}),
  };
}

export function mapRowToSessionRecord(row: any, messages: any[]): SessionRecord {
  const metadata = parseJsonObject(row.metadata);

  return {
    id: row.id,
    sessionId: row.id,
    kind: row.kind,
    host: deriveSessionHost(row.kind, row.source_ref),
    sourceRef: row.source_ref,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    messages: messages.map((message) => mapRowToSessionMessage(message)),
    ...(metadata ? { metadata } : {}),
  };
}
