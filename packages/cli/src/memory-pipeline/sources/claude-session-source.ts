import type { WorkItem } from '../types.js';

export type ClaudeSessionWorkItem = WorkItem & {
  kind: 'session';
};

export interface ClaudeSessionSource {
  collect(): Promise<ClaudeSessionWorkItem[]>;
}

export class StubClaudeSessionSource implements ClaudeSessionSource {
  async collect(): Promise<ClaudeSessionWorkItem[]> {
    return [];
  }
}
