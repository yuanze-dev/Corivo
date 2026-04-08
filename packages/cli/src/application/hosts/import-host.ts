import { getHostAdapter } from '@/infrastructure/hosts/registry.js';
import type {
  HostAdapter,
  HostId,
  HostImportOptions,
  HostImportResult,
} from '@/domain/host/contracts/types.js';
import type { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import type { RawMessageRole } from '@/infrastructure/storage/types/raw-memory.js';
import type { EnqueueSessionExtractionRequest } from '../memory-ingest/enqueue-session-extraction.js';
import type { Logger } from '@/infrastructure/logging.js';

export type HostImportRequest = HostImportOptions & { host: HostId };
type HostImportLogger = Pick<Logger, 'debug'>;
type GetHostAdapter = (host: HostId) => HostAdapter | null;
type GetHostImportCursor = (host: HostId) => Promise<string | undefined> | string | undefined;
type SaveHostImportCursor = (host: HostId, cursor: string) => Promise<void> | void;
type PersistHostImportResult = (result: HostImportResult) => Promise<void> | void;

interface ImportedMessageLike {
  externalMessageId?: string;
  role: RawMessageRole;
  content: string;
  createdAt?: number;
}

interface ImportedSessionLike {
  host: HostId;
  externalSessionId: string;
  cursor: string;
  startedAt?: number;
  endedAt?: number;
  messages: ImportedMessageLike[];
}

export interface PersistImportedSessionsDeps {
  repository: Pick<RawMemoryRepository, 'upsertMessage' | 'upsertSession'>;
  enqueueSessionExtraction?: (
    input: EnqueueSessionExtractionRequest,
  ) => unknown;
}

export interface HostImportUseCaseDependencies {
  logger?: HostImportLogger;
  getAdapter?: GetHostAdapter;
  getLastCursor?: GetHostImportCursor;
  saveLastCursor?: SaveHostImportCursor;
  persistImportResult?: PersistHostImportResult;
}

export function createHostImportUseCase(deps?: HostImportUseCaseDependencies) {
  return async (input: HostImportRequest): Promise<HostImportResult> => {
    const logger = deps?.logger;
    const getAdapter = deps?.getAdapter ?? ((host: HostId) => getHostAdapter(host));
    const getLastCursor = deps?.getLastCursor ?? (() => undefined);
    const saveLastCursor = deps?.saveLastCursor ?? (() => {});
    const persistImportResult = deps?.persistImportResult ?? (() => {});

    const mode: HostImportResult['mode'] = input.all ? 'full' : 'incremental';
    logger?.debug(
      `[host:import] start host=${input.host} mode=${mode} dryRun=${input.dryRun ? 'true' : 'false'} target=${input.target ?? '<default>'}`
    );

    const adapter = getAdapter(input.host);
    if (!adapter?.importHistory) {
      const message = `Host import is not supported for ${input.host}.`;
      logger?.debug(`[host:import] unsupported host=${input.host}`);
      return {
        success: false,
        host: input.host,
        mode,
        importedSessionCount: 0,
        importedMessageCount: 0,
        summary: message,
        error: message,
      };
    }

    const resolvedOptions: HostImportOptions = {
      all: input.all,
      since: input.since,
      limit: input.limit,
      dryRun: input.dryRun,
      target: input.target,
    };

    if (!resolvedOptions.all && !resolvedOptions.since) {
      const cursor = await getLastCursor(input.host);
      if (!cursor) {
        const message = `No previous import cursor found for ${input.host}. Use --all or --since to bootstrap the first import.`;
        logger?.debug(`[host:import] missing bootstrap cursor host=${input.host}`);
        return {
          success: false,
          host: input.host,
          mode,
          importedSessionCount: 0,
          importedMessageCount: 0,
          summary: message,
          error: message,
        };
      }
      resolvedOptions.since = cursor;
      logger?.debug(`[host:import] using stored cursor host=${input.host} since=${cursor}`);
    }

    const result = await adapter.importHistory(resolvedOptions);
    const shouldPersist = result.success && !input.dryRun;
    const shouldSaveCursor = shouldPersist && Boolean(result.nextCursor);

    if (shouldPersist) {
      logger?.debug(`[host:import] persisting imported sessions host=${input.host}`);
      await persistImportResult(result);
    }

    if (shouldSaveCursor && result.nextCursor) {
      await saveLastCursor(input.host, result.nextCursor);
    }

    logger?.debug(
      `[host:import] completed host=${input.host} mode=${result.mode} sessions=${result.importedSessionCount} messages=${result.importedMessageCount} nextCursor=${result.nextCursor ?? '<none>'} dryRun=${input.dryRun ? 'true' : 'false'} persisted=${shouldPersist ? 'true' : 'false'} cursorSaved=${shouldSaveCursor ? 'true' : 'false'}`
    );

    return result;
  };
}

export async function persistImportedSessions(
  result: HostImportResult,
  deps: PersistImportedSessionsDeps,
): Promise<void> {
  for (const session of readImportedSessions(result)) {
    const sessionKey = `${session.host}:${session.externalSessionId}`;
    const latestAssistantMessage = [...session.messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    const lastMessageAt = session.messages.at(-1)?.createdAt
      ?? latestAssistantMessage?.createdAt
      ?? session.endedAt;

    deps.repository.upsertSession({
      host: session.host,
      externalSessionId: session.externalSessionId,
      sessionKey,
      sourceType: 'history-import',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lastMessageAt,
      lastImportCursor: session.cursor,
    });

    session.messages.forEach((message, index) => {
      deps.repository.upsertMessage({
        sessionKey,
        externalMessageId: message.externalMessageId,
        role: message.role,
        content: message.content,
        ordinal: index + 1,
        createdAt: message.createdAt,
        ingestedFrom: 'host-import',
      });
    });

    deps.enqueueSessionExtraction?.({
      host: session.host,
      sessionKey,
    });
  }
}

function readImportedSessions(result: HostImportResult): ImportedSessionLike[] {
  const candidate = (result as HostImportResult & {
    sessions?: unknown;
  }).sessions;

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isImportedSessionLike);
}

function isImportedSessionLike(value: unknown): value is ImportedSessionLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<ImportedSessionLike>;
  return Boolean(
    session.host
    && session.externalSessionId
    && session.cursor
    && Array.isArray(session.messages),
  );
}
