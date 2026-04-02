export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  sequence: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  sessionId: string;
  kind: string;
  host: string;
  sourceRef: string;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  endedAt?: number;
  messages: SessionMessage[];
  metadata?: Record<string, unknown>;
}
