import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { Plugin } from '@opencode-ai/plugin';
import { createOpencodeCorivoHooks } from './adapter.js';

const execFileAsync = promisify(execFile);

async function runCorivo(
  command: 'carry-over' | 'recall' | 'review',
  args: string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('corivo', [command, ...args, '--no-password'], {
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

const plugin: Plugin = async (input) => createOpencodeCorivoHooks({
  runCorivo,
  getLatestAssistantMessage: (sessionID) => getLatestAssistantMessage(input.client, sessionID),
});

export default {
  id: 'corivo',
  server: plugin,
};
