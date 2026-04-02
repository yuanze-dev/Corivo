import { getHostAdapter } from '../../hosts/registry.js';
import type {
  HostAdapter,
  HostId,
  HostImportOptions,
  HostImportResult,
} from '../../hosts/types.js';
import type { RawMemoryRepository } from '../../raw-memory/repository.js';
import type { RawMessageRole } from '../../raw-memory/types.js';
import type { EnqueueSessionExtractionRequest } from '../memory-ingest/enqueue-session-extraction.js';

export type HostImportRequest = HostImportOptions & { host: HostId };

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

export function createHostImportUseCase(deps?: {
  run?: (input: HostImportRequest) => Promise<HostImportResult>;
  getAdapter?: (host: HostId) => HostAdapter | null;
  getLastCursor?: (host: HostId) => Promise<string | undefined> | string | undefined;
  saveLastCursor?: (host: HostId, cursor: string) => Promise<void> | void;
  persistImportResult?: (result: HostImportResult) => Promise<void> | void;
}) {
  return async (input: HostImportRequest): Promise<HostImportResult> => {
    if (deps?.run) {
      return deps.run(input);
    }

    const getAdapter = deps?.getAdapter ?? ((host: HostId) => getHostAdapter(host));
    const getLastCursor = deps?.getLastCursor ?? (() => undefined);
    const saveLastCursor = deps?.saveLastCursor ?? (() => {});
    const persistImportResult = deps?.persistImportResult ?? (() => {});

    const mode: HostImportResult['mode'] = input.all ? 'full' : 'incremental';

    const adapter = getAdapter(input.host);
    if (!adapter?.importHistory) {
      const message = `Host import is not supported for ${input.host}.`;
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
    }

    const result = await adapter.importHistory(resolvedOptions);

    if (result.success && !input.dryRun) {
      await persistImportResult(result);
    }

    if (result.success && result.nextCursor && !input.dryRun) {
      await saveLastCursor(input.host, result.nextCursor);
    }

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
