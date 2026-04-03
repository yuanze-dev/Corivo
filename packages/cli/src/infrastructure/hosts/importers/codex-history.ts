import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HostId, HostImportOptions, HostImportResult } from '../types.js';

type ImportedMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ImportedMessageRecord {
  externalMessageId?: string;
  role: ImportedMessageRole;
  content: string;
  createdAt?: number;
}

export interface ImportedSessionRecord {
  host: HostId;
  externalSessionId: string;
  cursor: string;
  startedAt?: number;
  endedAt?: number;
  messages: ImportedMessageRecord[];
  sourcePath: string;
}

export interface CodexHistoryImportResult extends HostImportResult {
  sessions: ImportedSessionRecord[];
}

export async function importCodexHistory(
  options: HostImportOptions,
): Promise<CodexHistoryImportResult> {
  const sourceRoots = await resolveCodexSourceRoots(options.target);
  const files = await collectHistoryFiles(sourceRoots, ['.jsonl']);

  if (files.length === 0) {
    return buildUnavailableCodexResult(options, []);
  }

  const filteredFiles = files
    .filter((file) => isCursorAfter(file.cursor, options.since))
    .sort((left, right) => left.cursor.localeCompare(right.cursor));
  const sessions: ImportedSessionRecord[] = [];
  const maxSessions =
    typeof options.limit === 'number' && options.limit >= 0 ? options.limit : Number.POSITIVE_INFINITY;

  for (const file of filteredFiles) {
    const session = await parseCodexSessionFile(file.filePath, file.cursor);
    if (session) {
      sessions.push(session);
      if (sessions.length >= maxSessions) {
        break;
      }
    }
  }

  if (sessions.length === 0) {
    return buildUnparseableCodexResult(options, []);
  }

  const importedMessageCount = sessions.reduce((total, session) => total + session.messages.length, 0);

  return {
    success: true,
    host: 'codex',
    mode: options.all ? 'full' : 'incremental',
    importedSessionCount: sessions.length,
    importedMessageCount,
    nextCursor: sessions.at(-1)?.cursor,
    summary: `Imported ${sessions.length} session${sessions.length === 1 ? '' : 's'} from Codex history.`,
    sessions,
  };
}

export async function parseCodexSessionFile(
  filePath: string,
  fallbackCursor?: string,
): Promise<ImportedSessionRecord | null> {
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => tryParseJson(line))
    .filter((line): line is Record<string, unknown> => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  const stats = await fs.stat(filePath);
  const sessionMeta = lines.find((line) => getString(line.type) === 'session_meta');
  const sessionMetaPayload = isRecord(sessionMeta?.payload) ? sessionMeta.payload : null;
  const messages = lines
    .map((line) => normalizeCodexMessage(line))
    .filter((message): message is ImportedMessageRecord => Boolean(message));
  const startedAt =
    toTimestamp(sessionMetaPayload?.timestamp) ?? toTimestamp(sessionMeta?.timestamp) ?? toTimestamp(lines[0]?.timestamp);
  const endedAt = toTimestamp(lines.at(-1)?.timestamp);
  const externalSessionId =
    getString(sessionMetaPayload?.id) ?? getString(sessionMetaPayload?.session_id) ?? path.basename(filePath, '.jsonl');

  if (!externalSessionId || messages.length === 0) {
    return null;
  }

  return {
    host: 'codex',
    externalSessionId,
    cursor: fallbackCursor ?? toCursor(stats.mtimeMs),
    startedAt,
    endedAt,
    messages,
    sourcePath: filePath,
  };
}

function normalizeCodexMessage(input: Record<string, unknown>): ImportedMessageRecord | null {
  return normalizeUserEventMessage(input) ?? normalizeAssistantFinalAnswer(input);
}

function normalizeUserEventMessage(input: Record<string, unknown>): ImportedMessageRecord | null {
  if (getString(input.type) !== 'event_msg') {
    return null;
  }

  const payload = isRecord(input.payload) ? input.payload : null;
  if (!payload || getString(payload.type) !== 'user_message') {
    return null;
  }

  const content = getString(payload.message);
  if (!content) {
    return null;
  }

  return {
    role: 'user',
    content,
    createdAt: toTimestamp(input.timestamp),
  };
}

function normalizeAssistantFinalAnswer(input: Record<string, unknown>): ImportedMessageRecord | null {
  if (getString(input.type) !== 'response_item') {
    return null;
  }

  const payload = isRecord(input.payload) ? input.payload : null;
  if (!payload || getString(payload.type) !== 'message') {
    return null;
  }

  if (normalizeRole(payload.role) !== 'assistant' || getString(payload.phase) !== 'final_answer') {
    return null;
  }

  const content = flattenCodexContent(payload.content);
  if (!content) {
    return null;
  }

  return {
    externalMessageId: getString(payload.id),
    role: 'assistant',
    content,
    createdAt: toTimestamp(input.timestamp),
  };
}

async function resolveCodexSourceRoots(target?: string): Promise<string[]> {
  if (!target) {
    return dedupePaths([path.join(os.homedir(), '.codex', 'sessions')]);
  }

  const targetType = await getPathType(target);
  if (targetType === 'file') {
    return path.extname(target) === '.jsonl' ? dedupePaths([target]) : [];
  }

  if (targetType !== 'directory') {
    return [];
  }

  const baseName = path.basename(target);
  if (baseName === 'sessions') {
    return dedupePaths([target]);
  }

  if (baseName === '.codex') {
    return dedupePaths([path.join(target, 'sessions')]);
  }

  const nestedSessionRoots = await filterExistingPaths([path.join(target, '.codex', 'sessions')]);

  if (nestedSessionRoots.length > 0) {
    return dedupePaths(nestedSessionRoots);
  }

  return [];
}

async function collectHistoryFiles(
  roots: string[],
  extensions: string[],
): Promise<Array<{ filePath: string; cursor: string }>> {
  const results = new Map<string, { filePath: string; cursor: string }>();
  const uniqueRoots = await dedupePaths(roots);

  for (const root of uniqueRoots) {
    const entries = await collectFiles(root, extensions);
    for (const entry of entries) {
      const key = await toCanonicalPath(entry.filePath);
      if (!results.has(key)) {
        results.set(key, entry);
      }
    }
  }

  return Array.from(results.values());
}

async function collectFiles(
  candidatePath: string,
  extensions: string[],
): Promise<Array<{ filePath: string; cursor: string }>> {
  try {
    const stats = await fs.stat(candidatePath);
    if (stats.isFile()) {
      return extensions.includes(path.extname(candidatePath))
        ? [{ filePath: candidatePath, cursor: toCursor(stats.mtimeMs) }]
        : [];
    }

    const entries = await fs.readdir(candidatePath, { withFileTypes: true });
    const files: Array<{ filePath: string; cursor: string }> = [];

    for (const entry of entries) {
      const fullPath = path.join(candidatePath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectFiles(fullPath, extensions)));
        continue;
      }

      if (!entry.isFile() || !extensions.includes(path.extname(entry.name))) {
        continue;
      }

      const fileStats = await fs.stat(fullPath);
      files.push({ filePath: fullPath, cursor: toCursor(fileStats.mtimeMs) });
    }

    return files;
  } catch {
    return [];
  }
}

function buildUnavailableCodexResult(
  options: HostImportOptions,
  sessions: ImportedSessionRecord[],
): CodexHistoryImportResult {
  const message = 'No stable Codex history source detected.';
  return {
    success: false,
    host: 'codex',
    mode: options.all ? 'full' : 'incremental',
    importedSessionCount: 0,
    importedMessageCount: 0,
    summary: message,
    unavailableReason: message,
    sessions,
  };
}

function buildUnparseableCodexResult(
  options: HostImportOptions,
  sessions: ImportedSessionRecord[],
): CodexHistoryImportResult {
  const message = 'No parseable Codex sessions found.';
  return {
    success: false,
    host: 'codex',
    mode: options.all ? 'full' : 'incremental',
    importedSessionCount: 0,
    importedMessageCount: 0,
    summary: message,
    error: message,
    sessions,
  };
}

function normalizeRole(value: unknown): ImportedMessageRole | null {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value;
  }
  return null;
}

function flattenCodexContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return '';
      }

      if (typeof item.text === 'string') {
        return item.text.trim();
      }

      if ('content' in item) {
        return flattenCodexContent(item.content);
      }

      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toCursor(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function isCursorAfter(cursor: string, since?: string): boolean {
  if (!since) {
    return true;
  }

  const currentTime = Date.parse(cursor);
  const sinceTime = Date.parse(since);

  if (Number.isNaN(currentTime) || Number.isNaN(sinceTime)) {
    return cursor > since;
  }

  return currentTime > sinceTime;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function dedupePaths(paths: string[]): Promise<string[]> {
  const results = new Map<string, string>();

  for (const candidate of paths) {
    const key = await toCanonicalPath(candidate);
    if (!results.has(key)) {
      results.set(key, candidate);
    }
  }

  return Array.from(results.values());
}

async function toCanonicalPath(candidate: string): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

async function getPathType(candidate: string): Promise<'file' | 'directory' | null> {
  try {
    const stats = await fs.stat(candidate);
    if (stats.isFile()) {
      return 'file';
    }
    if (stats.isDirectory()) {
      return 'directory';
    }
  } catch {
    return null;
  }

  return null;
}

async function filterExistingPaths(paths: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const candidate of paths) {
    if ((await getPathType(candidate)) !== null) {
      results.push(candidate);
    }
  }

  return results;
}
