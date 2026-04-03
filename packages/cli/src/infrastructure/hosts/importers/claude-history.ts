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

export interface ClaudeHistoryImportResult extends HostImportResult {
  sessions: ImportedSessionRecord[];
}

export async function importClaudeHistory(
  options: HostImportOptions,
): Promise<ClaudeHistoryImportResult> {
  const sourceRoots = await resolveClaudeSourceRoots(options.target);
  const files = await collectHistoryFiles(sourceRoots, ['.json', '.jsonl']);

  if (files.length === 0) {
    const message = 'No Claude session history source detected.';
    return {
      success: false,
      host: 'claude-code',
      mode: options.all ? 'full' : 'incremental',
      importedSessionCount: 0,
      importedMessageCount: 0,
      summary: message,
      error: message,
      sessions: [],
    };
  }

  const filteredFiles = files
    .filter((file) => isCursorAfter(file.cursor, options.since))
    .sort((left, right) => left.cursor.localeCompare(right.cursor));
  const sessions: ImportedSessionRecord[] = [];
  const maxSessions =
    typeof options.limit === 'number' && options.limit >= 0 ? options.limit : Number.POSITIVE_INFINITY;

  for (const file of filteredFiles) {
    const session = await parseClaudeSessionFile(file.filePath, file.cursor);
    if (session) {
      sessions.push(session);
      if (sessions.length >= maxSessions) {
        break;
      }
    }
  }

  const importedMessageCount = sessions.reduce((total, session) => total + session.messages.length, 0);
  const nextCursor = sessions.at(-1)?.cursor;
  if (sessions.length === 0) {
    const message = 'No parseable Claude sessions found.';
    return {
      success: false,
      host: 'claude-code',
      mode: options.all ? 'full' : 'incremental',
      importedSessionCount: 0,
      importedMessageCount: 0,
      summary: message,
      error: message,
      sessions,
    };
  }

  const summary = `Imported ${sessions.length} session${sessions.length === 1 ? '' : 's'} from Claude history.`;

  return {
    success: true,
    host: 'claude-code',
    mode: options.all ? 'full' : 'incremental',
    importedSessionCount: sessions.length,
    importedMessageCount,
    nextCursor,
    summary,
    sessions,
  };
}

export async function parseClaudeSessionFile(
  filePath: string,
  fallbackCursor?: string,
): Promise<ImportedSessionRecord | null> {
  const raw = await fs.readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return null;
  }

  const stats = await fs.stat(filePath);
  const defaultCursor = fallbackCursor ?? toCursor(stats.mtimeMs);
  const parsedDocument = tryParseJson(raw);

  if (parsedDocument) {
    return buildClaudeSessionRecord(parsedDocument, filePath, defaultCursor);
  }

  const parsedLines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => tryParseJson(line))
    .filter((value): value is Record<string, unknown> => Boolean(value));

  if (parsedLines.length === 0) {
    return null;
  }

  const sessionDocument = buildClaudeDocumentFromLines(parsedLines);
  return buildClaudeSessionRecord(sessionDocument, filePath, defaultCursor);
}

function buildClaudeSessionRecord(
  source: Record<string, unknown>,
  filePath: string,
  cursor: string,
): ImportedSessionRecord | null {
  const externalSessionId = getString(source.sessionId) ?? getString(source.id) ?? path.basename(filePath);
  const startedAt = toTimestamp(source.startedAt) ?? toTimestamp(source.createdAt) ?? toTimestamp(source.timestamp);
  const endedAt = toTimestamp(source.endedAt) ?? toTimestamp(source.updatedAt) ?? toTimestamp(source.lastMessageAt);
  const messageInput = Array.isArray(source.messages) ? source.messages : [];
  const messages = messageInput
    .map((message) => normalizeClaudeMessage(message))
    .filter((message): message is ImportedMessageRecord => Boolean(message));

  if (!externalSessionId || messages.length === 0) {
    return null;
  }

  return {
    host: 'claude-code',
    externalSessionId,
    cursor,
    startedAt,
    endedAt,
    messages,
    sourcePath: filePath,
  };
}

function buildClaudeDocumentFromLines(lines: Record<string, unknown>[]): Record<string, unknown> {
  const metadata =
    lines.find((line) => getString(line.type) === 'session' || getString(line.type) === 'session_meta') ?? {};
  const messages = lines.filter((line) => {
    const role = normalizeRole(line.role);
    return Boolean(role) || getString(line.type) === 'message';
  });

  return {
    sessionId: getString(metadata.sessionId) ?? getString(metadata.id),
    startedAt: metadata.startedAt ?? metadata.timestamp,
    endedAt: metadata.endedAt ?? lines.at(-1)?.timestamp,
    messages,
  };
}

function normalizeClaudeMessage(input: unknown): ImportedMessageRecord | null {
  if (!isRecord(input)) {
    return null;
  }

  const role = normalizeRole(input.role);
  const content = flattenTextContent(input.content ?? input.text ?? input.message);

  if (!role || !content) {
    return null;
  }

  return {
    externalMessageId: getString(input.id) ?? getString(input.uuid),
    role,
    content,
    createdAt: toTimestamp(input.createdAt) ?? toTimestamp(input.timestamp),
  };
}

async function resolveClaudeSourceRoots(target?: string): Promise<string[]> {
  if (!target) {
    const homeDir = os.homedir();
    return dedupePaths([
      path.join(homeDir, '.claude', 'sessions'),
      path.join(homeDir, '.config', 'claude', 'sessions'),
    ]);
  }

  const targetType = await getPathType(target);
  if (targetType === 'file') {
    return ['.json', '.jsonl'].includes(path.extname(target)) ? dedupePaths([target]) : [];
  }

  if (targetType !== 'directory') {
    return [];
  }

  const baseName = path.basename(target);
  if (baseName === 'sessions') {
    return dedupePaths([target]);
  }

  if (baseName === '.claude') {
    return dedupePaths([path.join(target, 'sessions')]);
  }

  if (baseName === 'claude' && path.basename(path.dirname(target)) === '.config') {
    return dedupePaths([path.join(target, 'sessions')]);
  }

  const nestedSessionRoots = await filterExistingPaths([
    path.join(target, '.claude', 'sessions'),
    path.join(target, '.config', 'claude', 'sessions'),
  ]);

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

function normalizeRole(value: unknown): ImportedMessageRole | null {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value;
  }
  return null;
}

function flattenTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => flattenTextContent(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (isRecord(value)) {
    if (typeof value.text === 'string') {
      return value.text.trim();
    }

    if (typeof value.message === 'string') {
      return value.message.trim();
    }

    if ('content' in value) {
      return flattenTextContent(value.content);
    }
  }

  return '';
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
