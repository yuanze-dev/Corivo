import { createHash } from 'node:crypto';
import type { MemoryProvider } from '@/domain/memory/providers/types.js';
import type { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import type { RawMessageRecord } from '@/infrastructure/storage/types/raw-memory.js';

export interface SyncSessionTranscriptRequest {
  sessionKey: string;
}

export interface SyncSessionTranscriptDeps {
  repository: Pick<RawMemoryRepository, 'getTranscript'>;
  provider: MemoryProvider;
  readCheckpoint?: (sessionKey: string) => Promise<string | undefined> | string | undefined;
  writeCheckpoint?: (sessionKey: string, checkpoint: string) => Promise<void> | void;
}

interface TranscriptTurn {
  userMessages: RawMessageRecord[];
  assistantMessages: RawMessageRecord[];
}

export function createSyncSessionTranscriptToProviderUseCase(
  deps: SyncSessionTranscriptDeps,
) {
  const readCheckpoint = deps.readCheckpoint ?? (() => undefined);
  const writeCheckpoint = deps.writeCheckpoint ?? (() => {});

  return async (input: SyncSessionTranscriptRequest): Promise<void> => {
    const transcript = deps.repository.getTranscript(input.sessionKey);
    if (!transcript) {
      return;
    }

    const relevantMessages = transcript.messages.filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    );
    if (relevantMessages.length === 0) {
      return;
    }

    const checkpoint = await readCheckpoint(input.sessionKey);
    const unsyncedMessages = selectUnsyncedMessages(relevantMessages, checkpoint);
    const { turns, lastUploadedMessage } = buildCompleteTurns(unsyncedMessages);
    if (turns.length === 0 || !lastUploadedMessage) {
      return;
    }

    await deps.provider.save({
      content: turns.map(renderTurn).join('\n\n'),
      annotation: 'pending',
      source: 'session-transcript-sync',
      customId: buildSessionCustomId(input.sessionKey),
    });

    await writeCheckpoint(input.sessionKey, buildMessageCheckpoint(lastUploadedMessage));
  };
}

function selectUnsyncedMessages(
  messages: RawMessageRecord[],
  checkpoint: string | undefined,
): RawMessageRecord[] {
  if (!checkpoint) {
    return messages;
  }

  const index = messages.findIndex((message) => buildMessageCheckpoint(message) === checkpoint);
  if (index === -1) {
    return messages;
  }

  return messages.slice(index + 1);
}

function buildCompleteTurns(messages: RawMessageRecord[]): {
  turns: TranscriptTurn[];
  lastUploadedMessage: RawMessageRecord | null;
} {
  const turns: TranscriptTurn[] = [];
  let currentTurn: TranscriptTurn = {
    userMessages: [],
    assistantMessages: [],
  };
  let lastUploadedMessage: RawMessageRecord | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      if (currentTurn.assistantMessages.length > 0) {
        turns.push(currentTurn);
        lastUploadedMessage =
          currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1] ?? lastUploadedMessage;
        currentTurn = { userMessages: [], assistantMessages: [] };
      }
      currentTurn.userMessages.push(message);
      continue;
    }

    if (message.role === 'assistant') {
      currentTurn.assistantMessages.push(message);
    }
  }

  if (currentTurn.userMessages.length > 0 && currentTurn.assistantMessages.length > 0) {
    turns.push(currentTurn);
    lastUploadedMessage =
      currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1] ?? lastUploadedMessage;
  }

  return { turns, lastUploadedMessage };
}

function renderTurn(turn: TranscriptTurn): string {
  const userText = turn.userMessages.map((message) => message.content.trim()).filter(Boolean).join('\n');
  const assistantText = turn.assistantMessages.map((message) => message.content.trim()).filter(Boolean).join('\n');
  return [`user: ${userText}`, `assistant: ${assistantText}`].join('\n');
}

function buildSessionCustomId(sessionKey: string): string {
  const hash = createHash('sha256').update(sessionKey).digest('hex').slice(0, 24);
  return `corivo:conversation-session:${hash}`;
}

function buildMessageCheckpoint(
  message: Pick<RawMessageRecord, 'externalMessageId' | 'ordinal' | 'role'>,
): string {
  return message.externalMessageId ?? `${message.ordinal}:${message.role}`;
}
