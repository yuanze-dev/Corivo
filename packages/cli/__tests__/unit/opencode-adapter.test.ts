import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOpencodeCorivoHooks,
  type OpencodeAdapterDeps,
} from '../../../plugins/opencode/src/adapter.js';
import opencodePlugin from '../../../plugins/opencode/src/index.js';

describe('OpenCode Corivo adapter', () => {
  let deps: OpencodeAdapterDeps;
  let runCorivo: ReturnType<typeof vi.fn>;
  let getLatestAssistantMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runCorivo = vi.fn(async (command: string, args: string[]) => {
      if (command === 'carry-over') {
        return '[corivo] carry-over context';
      }
      if (command === 'recall') {
        return '[corivo] recall context';
      }
      if (command === 'review') {
        return '[corivo] review context';
      }
      return '';
    });

    getLatestAssistantMessage = vi.fn(async () => 'latest assistant answer');

    deps = {
      runCorivo,
      getLatestAssistantMessage,
    };
  });

  it('exports a plugin function as the default module export', () => {
    expect(typeof opencodePlugin).toBe('function');
  });

  it('loads carry-over on session.created and injects it into system transform', async () => {
    const hooks = createOpencodeCorivoHooks(deps);

    await hooks.event?.({
      event: {
        type: 'session.created',
        properties: {
          info: {
            id: 'ses_1',
          },
        },
      } as any,
    });

    const output = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']?.(
      {
        sessionID: 'ses_1',
        model: {} as any,
      },
      output,
    );

    expect(runCorivo).toHaveBeenCalledWith('carry-over', ['--format', 'hook-text']);
    expect(output.system).toContain('[corivo] carry-over context');
  });

  it('stores recall on chat.message and appends it to later system transform', async () => {
    const hooks = createOpencodeCorivoHooks(deps);

    await hooks['chat.message']?.(
      {
        sessionID: 'ses_2',
      } as any,
      {
        message: {
          role: 'user',
        } as any,
        parts: [
          {
            type: 'text',
            text: 'Should we keep Redis?',
          },
        ] as any,
      },
    );

    const output = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']?.(
      {
        sessionID: 'ses_2',
        model: {} as any,
      },
      output,
    );

    expect(runCorivo).toHaveBeenCalledWith('recall', [
      '--prompt',
      'Should we keep Redis?',
      '--format',
      'hook-text',
    ]);
    expect(output.system).toContain('[corivo] recall context');
  });

  it('runs review on session.idle using the latest assistant message', async () => {
    const hooks = createOpencodeCorivoHooks(deps);

    await hooks.event?.({
      event: {
        type: 'session.idle',
        properties: {
          sessionID: 'ses_3',
        },
      } as any,
    });

    expect(getLatestAssistantMessage).toHaveBeenCalledWith('ses_3');
    expect(runCorivo).toHaveBeenCalledWith('review', [
      '--last-message',
      'latest assistant answer',
      '--format',
      'hook-text',
    ]);
  });

  it('runs review on assistant message.updated without waiting for idle', async () => {
    const hooks = createOpencodeCorivoHooks(deps);

    await hooks.event?.({
      event: {
        type: 'message.updated',
        properties: {
          sessionID: 'ses_4',
          info: {
            role: 'assistant',
          },
        },
      } as any,
    });

    expect(getLatestAssistantMessage).toHaveBeenCalledWith('ses_4');
    expect(runCorivo).toHaveBeenCalledWith('review', [
      '--last-message',
      'latest assistant answer',
      '--format',
      'hook-text',
    ]);
  });
});
