export interface OpencodeAdapterDeps {
  runCorivo(command: 'carry-over' | 'recall' | 'review', args: string[]): Promise<string>;
  getLatestAssistantMessage?(sessionID: string): Promise<string | null>;
}

export interface OpencodeCorivoHooks {
  event?: (input: { event: any }) => Promise<void>;
  'chat.message'?: (
    input: { sessionID: string },
    output: { message: { role?: string }; parts: Array<{ type?: string; text?: string }> },
  ) => Promise<void>;
  'experimental.chat.system.transform'?: (
    input: { sessionID?: string; model: unknown },
    output: { system: string[] },
  ) => Promise<void>;
}

interface SessionMemoryState {
  carryOver?: string;
  recall?: string;
  review?: string;
}

function getTextFromParts(parts: Array<{ type?: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function createOpencodeCorivoHooks(
  deps: OpencodeAdapterDeps,
): OpencodeCorivoHooks {
  const sessionState = new Map<string, SessionMemoryState>();

  function getState(sessionID: string): SessionMemoryState {
    if (!sessionState.has(sessionID)) {
      sessionState.set(sessionID, {});
    }
    return sessionState.get(sessionID)!;
  }

  return {
    event: async ({ event }) => {
      if (event?.type === 'session.created') {
        const sessionID = event.properties?.info?.id;
        if (!sessionID) {
          return;
        }
        const output = await deps.runCorivo('carry-over', ['--format', 'hook-text']);
        if (output) {
          getState(sessionID).carryOver = output;
        }
      }

      if (event?.type === 'session.idle' || event?.type === 'message.updated') {
        const assistantRole = event?.properties?.info?.role;
        const sessionID = event.properties?.sessionID;
        if (event?.type === 'message.updated' && assistantRole !== 'assistant') {
          return;
        }
        if (!sessionID || !deps.getLatestAssistantMessage) {
          return;
        }

        const lastAssistantMessage = await deps.getLatestAssistantMessage(sessionID);
        if (!lastAssistantMessage) {
          return;
        }

        const output = await deps.runCorivo('review', [
          '--last-message',
          lastAssistantMessage,
          '--format',
          'hook-text',
        ]);

        if (output) {
          getState(sessionID).review = output;
        }
      }
    },

    'chat.message': async (input, output) => {
      if (output.message?.role && output.message.role !== 'user') {
        return;
      }

      const prompt = getTextFromParts(output.parts);
      if (!prompt) {
        return;
      }

      const recall = await deps.runCorivo('recall', [
        '--prompt',
        prompt,
        '--format',
        'hook-text',
      ]);

      if (recall) {
        getState(input.sessionID).recall = recall;
      }
    },

    'experimental.chat.system.transform': async (input, output) => {
      const sessionID = input.sessionID;
      if (!sessionID) {
        return;
      }

      const state = sessionState.get(sessionID);
      if (!state) {
        return;
      }

      for (const value of [state.carryOver, state.recall, state.review]) {
        if (value) {
          output.system.push(value);
        }
      }

      state.recall = undefined;
      state.review = undefined;
    },
  };
}
