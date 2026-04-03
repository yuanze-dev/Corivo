// This file is generated from src/adapter.ts and src/index.ts.
// Do not edit manually.

import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

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
  lastReviewedMessage?: string;
}

const BRIDGE_ARGS = {
  carryOver: ['--format', 'hook-text'] as const,
  reviewPrefix: ['--last-message'] as const,
  recallPrefix: ['--prompt'] as const,
  formatSuffix: ['--format', 'hook-text'] as const,
};

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
        const output = await deps.runCorivo('carry-over', [...BRIDGE_ARGS.carryOver]);
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

        const state = getState(sessionID);
        if (state.lastReviewedMessage === lastAssistantMessage) {
          return;
        }

        const output = await deps.runCorivo('review', [
          ...BRIDGE_ARGS.reviewPrefix,
          lastAssistantMessage,
          ...BRIDGE_ARGS.formatSuffix,
        ]);

        if (output) {
          state.review = output;
          state.lastReviewedMessage = lastAssistantMessage;
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
        ...BRIDGE_ARGS.recallPrefix,
        prompt,
        ...BRIDGE_ARGS.formatSuffix,
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

      state.carryOver = undefined;
      state.recall = undefined;
      state.review = undefined;
    },
  };
}

const execFileAsync = promisify(execFile);

async function runCorivo(
  command: 'carry-over' | 'recall' | 'review',
  args: string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('corivo', [command, ...args], {
      env: process.env,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function getLatestAssistantMessage(client: any, sessionID: string): Promise<string | null> {
  try {
    const messages = await client.session.messages({
      path: { id: sessionID },
    });

    const list = Array.isArray(messages) ? messages : messages?.data;
    if (!Array.isArray(list)) {
      return null;
    }

    for (let index = list.length - 1; index >= 0; index -= 1) {
      const item = list[index];
      if (item?.info?.role !== 'assistant') {
        continue;
      }

      const text = (item.parts ?? [])
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text.trim())
        .filter(Boolean)
        .join('\n')
        .trim();

      if (text) {
        return text;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export default async function plugin(input: { client: unknown }) {
  return createOpencodeCorivoHooks({
  runCorivo,
  getLatestAssistantMessage: (sessionID) => getLatestAssistantMessage((input as any).client, sessionID),
  });
}
