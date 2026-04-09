import { describe, expect, it, vi } from 'vitest';
import { createSyncSessionTranscriptToProviderUseCase } from '../../src/application/memory-ingest/sync-session-transcript-to-provider.js';

describe('sync session transcript to provider', () => {
  it('uploads complete new turns with a stable session-level customId', async () => {
    const save = vi.fn(async () => ({ ok: true, provider: 'supermemory' as const, id: 'doc_1' }));
    const readCheckpoint = vi.fn(async () => undefined);
    const writeCheckpoint = vi.fn(async () => {});
    const sync = createSyncSessionTranscriptToProviderUseCase({
      repository: {
        getTranscript: vi.fn(() => ({
          session: {
            sessionKey: 'codex:session-123',
            host: 'codex',
            externalSessionId: 'session-123',
          },
          messages: [
            {
              externalMessageId: 'msg-user-1',
              role: 'user',
              content: '总结一下上面的内容',
              ordinal: 1,
            },
            {
              externalMessageId: 'msg-assistant-1',
              role: 'assistant',
              content: '上面的核心结论是……',
              ordinal: 2,
            },
          ],
        })),
      } as any,
      provider: {
        provider: 'supermemory',
        save,
        search: vi.fn(),
        recall: vi.fn(),
        healthcheck: vi.fn(),
      },
      readCheckpoint,
      writeCheckpoint,
    });

    await sync({ sessionKey: 'codex:session-123' });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      annotation: 'pending',
      source: 'session-transcript-sync',
      customId: expect.stringMatching(/^corivo:conversation-session:[a-f0-9]+$/),
      content: 'user: 总结一下上面的内容\nassistant: 上面的核心结论是……',
    }));
    expect(writeCheckpoint).toHaveBeenCalledWith('codex:session-123', 'msg-assistant-1');
  });

  it('skips upload when unsynced entries do not yet contain a complete assistant reply', async () => {
    const save = vi.fn(async () => ({ ok: true, provider: 'supermemory' as const, id: 'doc_1' }));
    const writeCheckpoint = vi.fn(async () => {});
    const sync = createSyncSessionTranscriptToProviderUseCase({
      repository: {
        getTranscript: vi.fn(() => ({
          session: {
            sessionKey: 'codex:session-123',
            host: 'codex',
            externalSessionId: 'session-123',
          },
          messages: [
            {
              externalMessageId: 'msg-user-1',
              role: 'user',
              content: '只看到 user',
              ordinal: 1,
            },
          ],
        })),
      } as any,
      provider: {
        provider: 'supermemory',
        save,
        search: vi.fn(),
        recall: vi.fn(),
        healthcheck: vi.fn(),
      },
      readCheckpoint: vi.fn(async () => undefined),
      writeCheckpoint,
    });

    await sync({ sessionKey: 'codex:session-123' });

    expect(save).not.toHaveBeenCalled();
    expect(writeCheckpoint).not.toHaveBeenCalled();
  });
});
