import { describe, expect, it } from 'vitest';
import { parseIngestMessagePayload } from '../../src/cli/commands/ingest-message.js';

describe('ingest-message command', () => {
  it('rejects unsupported host values before execution', async () => {
    expect(() => parseIngestMessagePayload(JSON.stringify({
        host: 'not-a-host',
        externalSessionId: 'session-1',
        role: 'user',
        content: 'hello',
        ingestedFrom: 'test',
      }))).toThrow(
      'Invalid ingest-message payload: host must be one of claude-code, codex, cursor, opencode, project-claude.',
    );
  });

  it('rejects unsupported role values before execution', async () => {
    expect(() => parseIngestMessagePayload(JSON.stringify({
        host: 'codex',
        externalSessionId: 'session-1',
        role: 'reviewer',
        content: 'hello',
        ingestedFrom: 'test',
      }))).toThrow(
      'Invalid ingest-message payload: role must be one of system, user, assistant, tool.',
    );
  });
});
