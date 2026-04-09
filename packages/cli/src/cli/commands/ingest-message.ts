import { Command } from 'commander';
import { ConfigError } from '@/domain/errors/index.js';
import {
  createIngestRealtimeMessageUseCase,
  type IngestRealtimeMessageRequest,
} from '../../application/memory-ingest/ingest-realtime-message.js';
import { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import { getCliConfigDir, loadCliConfig } from '@/cli/runtime';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';
import { createSyncSessionTranscriptToProviderUseCase } from '@/application/memory-ingest/sync-session-transcript-to-provider.js';
import { createFileSessionSyncTracker } from '@/application/memory-ingest/session-sync-tracker.js';

const VALID_HOSTS = new Set([
  'claude-code',
  'codex',
  'cursor',
  'opencode',
] as const);

const VALID_ROLES = new Set([
  'system',
  'user',
  'assistant',
  'tool',
] as const);

export interface IngestMessageCommandDeps {
  readStdin?: () => Promise<string>;
  execute?: (input: IngestRealtimeMessageRequest) => Promise<void>;
}

export function createIngestMessageCommand(
  deps: IngestMessageCommandDeps = {},
): Command {
  return new Command('ingest-message')
    .description('Internal hook bridge for realtime raw-memory ingest')
    .action(async () => {
      const payload = await (deps.readStdin ?? readStdin)();
      const input = parseIngestMessagePayload(payload);

      if (!input) {
        return;
      }

      const execute = deps.execute ?? await createDefaultExecutor();
      await execute(input);
    });
}

export const ingestMessageCommand = createIngestMessageCommand();

async function createDefaultExecutor() {
  const db = await loadRuntimeDb({ password: false });
  if (!db) {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }
  const config = await loadCliConfig();

  const repository = new RawMemoryRepository(db);
  const tracker = createFileSessionSyncTracker(getCliConfigDir());
  const syncSessionTranscript =
    config?.memoryEngine?.provider === 'supermemory'
      ? createSyncSessionTranscriptToProviderUseCase({
          repository,
          provider: resolveMemoryProvider(config),
          readCheckpoint: tracker.readCheckpoint,
          writeCheckpoint: tracker.writeCheckpoint,
        })
      : undefined;
  const ingestRealtimeMessage = createIngestRealtimeMessageUseCase({
    repository,
    syncSessionTranscript,
  });

  return async (input: IngestRealtimeMessageRequest) => {
    await ingestRealtimeMessage(input);
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

export function parseIngestMessagePayload(payload: string): IngestRealtimeMessageRequest | null {
  if (!payload.trim()) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new Error(`Invalid ingest-message payload: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid ingest-message payload: expected an object.');
  }

  const input = parsed as Record<string, unknown>;
  const host = requireHost(input.host);
  const externalSessionId = requireString(input.externalSessionId, 'externalSessionId');
  const role = requireRole(input.role);
  const content = requireString(input.content, 'content');
  const ingestedFrom = requireString(input.ingestedFrom, 'ingestedFrom');

  return {
    host,
    externalSessionId,
    role,
    content,
    ingestedFrom,
    externalMessageId: optionalString(input.externalMessageId),
    ordinal: optionalInteger(input.ordinal, 'ordinal'),
    createdAt: optionalInteger(input.createdAt, 'createdAt'),
    projectIdentity: optionalString(input.projectIdentity),
    ingestEventId: optionalString(input.ingestEventId),
    priority: optionalInteger(input.priority, 'priority'),
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ingest-message payload: ${field} must be a non-empty string.`);
  }

  return value;
}

function requireHost(value: unknown): IngestRealtimeMessageRequest['host'] {
  const host = requireString(value, 'host');
  if (!VALID_HOSTS.has(host as IngestRealtimeMessageRequest['host'])) {
    throw new Error('Invalid ingest-message payload: host must be one of claude-code, codex, cursor, opencode.');
  }

  return host as IngestRealtimeMessageRequest['host'];
}

function requireRole(value: unknown): IngestRealtimeMessageRequest['role'] {
  const role = requireString(value, 'role');
  if (!VALID_ROLES.has(role as IngestRealtimeMessageRequest['role'])) {
    throw new Error('Invalid ingest-message payload: role must be one of system, user, assistant, tool.');
  }

  return role as IngestRealtimeMessageRequest['role'];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Invalid ingest-message payload: ${field} must be an integer.`);
  }

  return value;
}
