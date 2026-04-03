import type {
  MemoryScope,
  ParsedRawMemoryDocument,
  RawMemoryDocument,
  RawMemoryFrontmatter,
  RawMemoryItem,
} from '../contracts/memory-documents.js';
import { MEMORY_SCOPES } from '../contracts/memory-documents.js';
import { MEMORY_TYPES, type MemoryType } from '../prompts/memory-types.js';

const LEGACY_NO_MEMORIES_MARKER = '<!-- NO_MEMORIES -->';
const JSON_NO_MEMORIES = '{"items":[]}';
const FILE_BLOCK_PATTERN =
  /<!--\s*FILE:\s*([^\s].*?)\s*-->\s*```markdown\s*([\s\S]*?)\s*```/g;
const FILE_PATH_PATTERN = /^(private|team)\/([A-Za-z0-9._-]+)\.md$/;

export function parseRawMemoryDocument(payload: string): ParsedRawMemoryDocument {
  const trimmed = payload.trim();

  if (trimmed === LEGACY_NO_MEMORIES_MARKER || trimmed === JSON_NO_MEMORIES) {
    return {
      noMemories: true,
      items: [],
    };
  }

  if (trimmed.startsWith('<!-- FILE:')) {
    return parseLegacyMarkdown(trimmed);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Malformed raw memory document: expected JSON object payload with an "items" array.');
  }

  const items = parseItems(parsed);
  return {
    noMemories: items.length === 0,
    items,
  };
}

function parseLegacyMarkdown(trimmed: string): ParsedRawMemoryDocument {
  const documents: RawMemoryDocument[] = [];
  let matchedAny = false;
  let cursor = 0;

  for (const match of trimmed.matchAll(FILE_BLOCK_PATTERN)) {
    const [, filePath, blockBody] = match;
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;

    if (trimmed.slice(cursor, matchStart).trim() !== '') {
      throw new Error('Malformed raw memory document: found content outside a FILE markdown block.');
    }

    matchedAny = true;
    cursor = matchEnd;
    const normalizedFilePath = filePath.trim();
    const parsedDocument = parseLegacyMarkdownBlock(blockBody);
    validateLegacyFilePath(normalizedFilePath, parsedDocument.frontmatter.scope);

    documents.push({
      filePath: normalizedFilePath,
      ...parsedDocument,
    });
  }

  if (!matchedAny || trimmed.slice(cursor).trim() !== '') {
    throw new Error('Malformed raw memory document: expected FILE comments followed by fenced markdown blocks.');
  }

  return {
    noMemories: false,
    items: documents.map(({ frontmatter, body }) => ({ frontmatter, body })),
    documents,
  };
}

export function materializeRawMemoryDocuments(items: RawMemoryItem[]): RawMemoryDocument[] {
  const counters = new Map<string, number>();

  return items.map((item) => {
    const slugBase = slugify(item.frontmatter.name);
    const key = `${item.frontmatter.scope}:${slugBase}`;
    const nextCount = (counters.get(key) ?? 0) + 1;
    counters.set(key, nextCount);
    const slug = nextCount === 1 ? slugBase : `${slugBase}-${nextCount}`;

    return {
      filePath: `${item.frontmatter.scope}/${slug}.md`,
      frontmatter: item.frontmatter,
      body: item.body,
    };
  });
}

function parseItems(parsed: unknown): RawMemoryItem[] {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Malformed raw memory document: top-level payload must be an object.');
  }

  const itemsValue = (parsed as { items?: unknown }).items;
  if (!Array.isArray(itemsValue)) {
    throw new Error('Malformed raw memory document: expected top-level "items" array.');
  }

  return itemsValue.map((item, index) => parseItem(item, index));
}

function parseItem(item: unknown, index: number): RawMemoryItem {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Malformed raw memory document: item ${index} must be an object.`);
  }

  const record = item as Record<string, unknown>;
  const frontmatter = parseFrontmatter(record.frontmatter, index);
  const body = requireNonEmpty(asString(record.body), `items[${index}].body`);

  return {
    frontmatter,
    body,
  };
}

function parseLegacyMarkdownBlock(blockBody: string): Omit<RawMemoryDocument, 'filePath'> {
  const normalized = blockBody.trim();

  if (!normalized.startsWith('---')) {
    throw new Error('Raw memory block must start with frontmatter.');
  }

  const frontmatterEnd = normalized.indexOf('\n---', 3);
  if (frontmatterEnd === -1) {
    throw new Error('Raw memory block is missing frontmatter terminator.');
  }

  const frontmatterBody = normalized.slice(4, frontmatterEnd).trim();
  const body = normalized.slice(frontmatterEnd + 4).trim();

  return {
    frontmatter: parseFrontmatter(Object.fromEntries(parseFrontmatterEntries(frontmatterBody)), -1),
    body,
  };
}

function parseFrontmatter(value: unknown, index: number): RawMemoryFrontmatter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Malformed raw memory document: items[${index}].frontmatter must be an object.`);
  }

  const frontmatter = value as Record<string, unknown>;
  const name = requireNonEmpty(asString(frontmatter.name), 'name');
  const description = requireNonEmpty(asString(frontmatter.description), 'description');
  const type = parseMemoryType(asString(frontmatter.type));
  const scope = parseMemoryScope(asString(frontmatter.scope));
  const sourceSession = requireNonEmpty(asString(frontmatter.source_session), 'source_session');
  const forget = frontmatter.forget;

  return {
    name,
    description,
    type,
    scope,
    source_session: sourceSession,
    ...(forget === undefined ? {} : { forget: parseForgetValue(forget) }),
  };
}

function parseFrontmatterEntries(frontmatterBody: string): Array<readonly [string, string]> {
  return frontmatterBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator === -1) {
        throw new Error(`Invalid frontmatter line: ${line}`);
      }

      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
    });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requireNonEmpty(value: string | undefined, key: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Invalid raw memory frontmatter: missing required field "${key}".`);
  }

  return value.trim();
}

function parseMemoryType(value: string | undefined): MemoryType {
  const normalized = requireNonEmpty(value, 'type');

  if (!MEMORY_TYPES.includes(normalized as MemoryType)) {
    throw new Error(`Invalid raw memory frontmatter: unsupported type "${normalized}".`);
  }

  return normalized as MemoryType;
}

function parseMemoryScope(value: string | undefined): MemoryScope {
  const normalized = requireNonEmpty(value, 'scope');

  if (!MEMORY_SCOPES.includes(normalized as MemoryScope)) {
    throw new Error(`Invalid raw memory frontmatter: unsupported scope "${normalized}".`);
  }

  return normalized as MemoryScope;
}

function parseForgetValue(value: unknown): boolean | string {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid raw memory frontmatter: forget must be a boolean or string.');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return value.trim();
}

function validateLegacyFilePath(filePath: string, scope: MemoryScope): void {
  const match = FILE_PATH_PATTERN.exec(filePath);

  if (!match) {
    throw new Error(
      'Invalid raw memory file path: expected "{scope}/{filename}.md" with no traversal or extra directories.',
    );
  }

  const [, pathScope, filename] = match;

  if (pathScope !== scope) {
    throw new Error(
      `Invalid raw memory file path: FILE path scope "${pathScope}" does not match frontmatter.scope "${scope}".`,
    );
  }

  if (filename === '.' || filename === '..') {
    throw new Error('Invalid raw memory file path: traversal segments are not allowed.');
  }
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'memory';
}
