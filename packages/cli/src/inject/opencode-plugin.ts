import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const OPENCODE_PLUGIN_TEMPLATE = `
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const execFileAsync = promisify(execFile)

async function runCorivo(command: 'carry-over' | 'recall' | 'review', args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('corivo', [command, ...args, '--no-password'], {
      env: process.env,
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

async function getLatestAssistantMessage(client: any, sessionID: string): Promise<string | null> {
  try {
    const messages = await client.session.messages({ path: { id: sessionID } })
    const list = Array.isArray(messages) ? messages : messages?.data
    if (!Array.isArray(list)) return null
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const item = list[index]
      if (item?.info?.role !== 'assistant') continue
      const text = (item.parts ?? [])
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text.trim())
        .filter(Boolean)
        .join('\\n')
        .trim()
      if (text) return text
    }
  } catch {
    return null
  }
  return null
}

export default async function corivoPlugin(input: any) {
  const sessionState = new Map<string, {
    carryOver?: string
    recall?: string
    review?: string
    lastReviewedMessage?: string
  }>()

  const getState = (sessionID: string) => {
    if (!sessionState.has(sessionID)) sessionState.set(sessionID, {})
    return sessionState.get(sessionID)!
  }

  const getTextFromParts = (parts: Array<{ type?: string; text?: string }>) => {
    return parts
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text!.trim())
      .filter(Boolean)
      .join('\\n')
      .trim()
  }

  return {
    event: async ({ event }: any) => {
      if (event?.type === 'session.created') {
        const sessionID = event.properties?.info?.id
        if (!sessionID) return
        const output = await runCorivo('carry-over', ['--format', 'hook-text'])
        if (output) getState(sessionID).carryOver = output
      }

      if (event?.type === 'session.idle' || event?.type === 'message.updated') {
        const assistantRole = event?.properties?.info?.role
        const sessionID = event.properties?.sessionID
        if (event?.type === 'message.updated' && assistantRole !== 'assistant') return
        if (!sessionID) return
        const state = getState(sessionID)
        const lastAssistantMessage = await getLatestAssistantMessage(input.client, sessionID)
        if (!lastAssistantMessage) return
        if (state.lastReviewedMessage === lastAssistantMessage) return
        const output = await runCorivo('review', ['--last-message', lastAssistantMessage, '--format', 'hook-text'])
        if (output) {
          state.review = output
          state.lastReviewedMessage = lastAssistantMessage
        }
      }
    },

    'chat.message': async (eventInput: any, output: any) => {
      if (output.message?.role && output.message.role !== 'user') return
      const prompt = getTextFromParts(output.parts ?? [])
      if (!prompt) return
      const recall = await runCorivo('recall', ['--prompt', prompt, '--format', 'hook-text'])
      if (recall) getState(eventInput.sessionID).recall = recall
    },

    'experimental.chat.system.transform': async (eventInput: any, output: any) => {
      const sessionID = eventInput.sessionID
      if (!sessionID) return
      const state = sessionState.get(sessionID)
      if (!state) return
      for (const value of [state.carryOver, state.recall, state.review]) {
        if (value) output.system.push(value)
      }
      state.recall = undefined
      state.review = undefined
    },
  }
}
`.trimStart();

export async function injectGlobalOpencodePlugin(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const pluginDir = path.join(home, '.config', 'opencode', 'plugins');
  const filePath = path.join(pluginDir, 'corivo.ts');

  try {
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(filePath, OPENCODE_PLUGIN_TEMPLATE, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
