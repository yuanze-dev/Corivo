import {
  DatabaseSessionRecordSource,
  type SessionRecordRepository,
  type SessionRecordSourceMode,
  type SessionRecordWorkItem,
} from './session-record-source.js';

export type ClaudeSessionWorkItem = SessionRecordWorkItem;

export interface ClaudeSessionSource {
  collect(): Promise<ClaudeSessionWorkItem[]>;
}

export interface DatabaseClaudeSessionSourceConfig {
  repository: SessionRecordRepository;
  mode?: SessionRecordSourceMode;
}

export class DatabaseClaudeSessionSource
  extends DatabaseSessionRecordSource
  implements ClaudeSessionSource {
  constructor(config: DatabaseClaudeSessionSourceConfig) {
    super({
      ...config,
      sessionKind: 'claude-session',
    });
  }
}

export class StubClaudeSessionSource implements ClaudeSessionSource {
  async collect(): Promise<ClaudeSessionWorkItem[]> {
    return [];
  }
}
