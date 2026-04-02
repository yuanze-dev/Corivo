import type {
  MemoryScope,
  ParsedRawMemoryDocument,
  RawMemoryDocument,
  RawMemoryFrontmatter,
} from '../contracts/memory-documents.js';
import { MEMORY_SCOPES } from '../contracts/memory-documents.js';
import { MEMORY_TYPES, type MemoryType } from '../prompts/memory-types.js';

const NO_MEMORIES_MARKER = '<!-- NO_MEMORIES -->';
const FILE_BLOCK_PATTERN =
  /<!--\s*FILE:\s*([^\s].*?)\s*-->\s*```markdown\s*([\s\S]*?)\s*```/g;

export function parseRawMemoryDocument(markdown: string): ParsedRawMemoryDocument {
  const trimmed = markdown.trim();

  if (trimmed === NO_MEMORIES_MARKER) {
    return {
      noMemories: true,
      documents: [],
    };
  }

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
    documents.push({
      filePath: filePath.trim(),
      ...parseMarkdownBlock(blockBody),
    });
  }

  if (!matchedAny || trimmed.slice(cursor).trim() !== '') {
    throw new Error('Malformed raw memory document: expected FILE comments followed by fenced markdown blocks.');
  }

  return {
    noMemories: false,
    documents,
  };
}

function parseMarkdownBlock(blockBody: string): Omit<RawMemoryDocument, 'filePath'> {
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
    frontmatter: parseFrontmatter(frontmatterBody),
    body,
  };
}

function parseFrontmatter(frontmatterBody: string): RawMemoryFrontmatter {
  const entries = frontmatterBody
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

  const frontmatter = Object.fromEntries(entries) as Record<string, string>;

  const name = requireNonEmpty(frontmatter.name, 'name');
  const description = requireNonEmpty(frontmatter.description, 'description');
  const type = parseMemoryType(frontmatter.type);
  const scope = parseMemoryScope(frontmatter.scope);
  const sourceSession = requireNonEmpty(frontmatter.source_session, 'source_session');

  return {
    name,
    description,
    type,
    scope,
    source_session: sourceSession,
    ...(frontmatter.forget ? { forget: parseForgetValue(frontmatter.forget) } : {}),
  };
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

function parseForgetValue(value: string): boolean | string {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return value.trim();
}
