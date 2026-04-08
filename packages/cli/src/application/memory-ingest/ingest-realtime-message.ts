import type { HostId } from '@/domain/host/contracts/types.js';
import type { RawMessageRole } from '@/infrastructure/storage/types/raw-memory.js';
import type { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import type {
  EnqueueSessionExtractionRequest,
} from './enqueue-session-extraction.js';

export interface IngestRealtimeMessageRequest {
  host: HostId;
  externalSessionId: string;
  externalMessageId?: string;
  role: RawMessageRole;
  content: string;
  ordinal?: number;
  createdAt?: number;
  projectIdentity?: string;
  ingestedFrom: string;
  ingestEventId?: string;
  priority?: number;
}

export interface IngestRealtimeMessageResult {
  sessionKey: string;
  ordinal: number;
}

export interface IngestRealtimeMessageDeps {
  repository: Pick<
    RawMemoryRepository,
    'getTranscript' | 'listMessages' | 'upsertMessage' | 'upsertSession'
  >;
  enqueueSessionExtraction: (
    input: EnqueueSessionExtractionRequest,
  ) => unknown;
  now?: () => number;
}

export function createIngestRealtimeMessageUseCase(
  deps: IngestRealtimeMessageDeps,
) {
  const now = deps.now ?? (() => Date.now());

  return async (
    input: IngestRealtimeMessageRequest,
  ): Promise<IngestRealtimeMessageResult> => {
    if (!input.host || !input.externalSessionId) {
      throw new Error('Realtime ingest requires host and externalSessionId.');
    }

    if (!input.ingestedFrom) {
      throw new Error('Realtime ingest requires ingestedFrom.');
    }

    if (typeof input.content !== 'string') {
      throw new Error('Realtime ingest requires string content.');
    }

    const sessionKey = `${input.host}:${input.externalSessionId}`;
    const transcript = deps.repository.getTranscript(sessionKey);
    const timestamp = input.createdAt ?? now();
    const ordinal = input.ordinal ?? nextOrdinal(transcript?.messages ?? []);
    deps.repository.upsertSession({
      host: input.host,
      externalSessionId: input.externalSessionId,
      sessionKey,
      sourceType: 'realtime-hook',
      projectIdentity: input.projectIdentity ?? transcript?.session.projectIdentity,
      startedAt: transcript?.session.startedAt ?? timestamp,
      endedAt: transcript?.session.endedAt,
      lastMessageAt: timestamp,
      lastImportCursor: transcript?.session.lastImportCursor,
    });

    deps.repository.upsertMessage({
      sessionKey,
      externalMessageId: input.externalMessageId,
      role: input.role,
      content: input.content,
      ordinal,
      createdAt: timestamp,
      ingestedFrom: input.ingestedFrom,
      ingestEventId: input.ingestEventId,
    });

    deps.enqueueSessionExtraction({
      host: input.host,
      sessionKey,
      priority: input.priority,
    });

    return {
      sessionKey,
      ordinal,
    };
  };
}

function nextOrdinal(
  messages: Array<{ ordinal: number }>,
): number {
  return messages.reduce((max, message) => Math.max(max, message.ordinal), 0) + 1;
}
