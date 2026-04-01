export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  kind: string;
  sourceRef: string;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  endedAt?: number;
  messages: SessionMessage[];
  metadata?: Record<string, unknown>;
}
