import { createHmac } from 'node:crypto';
import type { CorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import type { Logger as SyncLogger } from '../utils/logging.js';

export interface PulledChangeset {
  table_name: string;
  pk: string;
  col_name: string | null;
  col_version?: number;
  db_version?: number;
  value: string | null;
  site_id?: string;
}

function stringifyPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...<trimmed ${text.length - maxLength} chars>`;
}

function summarizeChangesets(changesets: PulledChangeset[]): string {
  if (changesets.length === 0) return '[]';
  return truncate(
    stringifyPayload(
      changesets.slice(0, 3).map((changeset) => ({
        table_name: changeset.table_name,
        pk: changeset.pk,
        col_name: changeset.col_name,
        db_version: changeset.db_version,
        site_id: changeset.site_id,
        value_length: changeset.value?.length ?? 0,
      })),
    ),
  );
}

// Simple fetch wrapper (Node.js 18+ built-in fetch)
export async function post(
  url: string,
  body: unknown,
  logger: SyncLogger,
  token?: string,
  label = 'request',
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  logger.debug(`[sync:${label}] request url=${url} token=${token ? 'present' : 'absent'} body=${truncate(stringifyPayload(body))}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error(`[sync:${label}] request failed status=${res.status} body=${truncate(text)}`);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  logger.debug(`[sync:${label}] response status=${res.status} body=${truncate(text)}`);
  return text.length === 0 ? null : JSON.parse(text);
}

export async function get(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function authenticate(
  serverUrl: string,
  identityId: string,
  sharedSecret: string,
  logger: SyncLogger,
): Promise<string> {
  const { challenge } = (await post(
    `${serverUrl}/auth/challenge`,
    { identity_id: identityId },
    logger,
    undefined,
    'auth-challenge',
  )) as { challenge: string };
  const response = createHmac('sha256', sharedSecret).update(challenge).digest('hex');
  const { token } = (await post(
    `${serverUrl}/auth/verify`,
    {
      identity_id: identityId,
      challenge,
      response,
    },
    logger,
    undefined,
    'auth-verify',
  )) as { token: string };
  return token;
}

export function applyPulledChangesets(
  db: CorivoDatabase,
  changesets: PulledChangeset[],
  logger: SyncLogger,
): number {
  let applied = 0;
  logger.debug(`[sync:pull] received ${changesets.length} pull changesets preview=${summarizeChangesets(changesets)}`);

  for (const cs of changesets) {
    if (cs.table_name !== 'blocks' || cs.col_name !== 'content' || !cs.pk || cs.value == null) {
      logger.debug(
        `[sync:pull] skipped changeset block=${cs.pk || '(empty)'} table=${cs.table_name} col=${cs.col_name ?? 'null'} dbVersion=${cs.db_version ?? 'n/a'}`,
      );
      continue;
    }

    logger.debug(
      `[sync:pull] preparing to write block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} contentLength=${cs.value.length}`,
    );
    try {
      db.upsertBlock({
        id: cs.pk,
        content: cs.value,
      });
    } catch (error) {
      logger.error(
        `[sync:pull] failed to write block=${cs.pk} dbVersion=${cs.db_version ?? 'n/a'} site=${cs.site_id ?? 'n/a'} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    applied++;
    logger.debug(`[sync:pull] wrote block successfully block=${cs.pk} applied=${applied}`);
  }

  logger.debug(`[sync:pull] apply complete applied=${applied}/${changesets.length}`);
  return applied;
}
