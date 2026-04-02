import type { HostId } from '../hosts/types.js';

export type RawSessionSourceType = 'history-import' | 'realtime-hook';

export type RawMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface RawSessionInput {
  host: HostId;
  externalSessionId: string;
  sessionKey: string;
  sourceType: RawSessionSourceType;
  projectIdentity?: string;
  startedAt?: number;
  endedAt?: number;
  lastMessageAt?: number;
  lastImportCursor?: string;
}

export interface RawSessionRecord extends RawSessionInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface RawMessageInput {
  sessionKey: string;
  externalMessageId?: string;
  role: RawMessageRole;
  content: string;
  ordinal: number;
  createdAt?: number;
  ingestedFrom: string;
  ingestEventId?: string;
}

export interface RawMessageRecord extends RawMessageInput {
  id: string;
  createdDbAt: number;
  updatedDbAt: number;
}

export interface RawTranscript {
  session: RawSessionRecord;
  messages: RawMessageRecord[];
}

export type MemoryProcessingJobType = 'extract-session';

export type MemoryProcessingJobStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface EnsureExtractSessionJobInput {
  host: HostId;
  sessionKey: string;
  availableAt?: number;
  priority?: number;
}

export interface MemoryProcessingJobRecord {
  id: string;
  host: HostId;
  sessionKey: string;
  jobType: MemoryProcessingJobType;
  status: MemoryProcessingJobStatus;
  dedupeKey: string;
  priority: number;
  attemptCount: number;
  availableAt: number;
  claimedAt: number | null;
  finishedAt: number | null;
  lastError: string | null;
  payloadJson: string | null;
  createdAt: number;
  updatedAt: number;
}
