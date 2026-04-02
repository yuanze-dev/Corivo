import type {
  FinalMemoryFileBlock,
  FinalMemoryFrontmatter,
  FinalMemoryDocument,
  MemoryIndexEntry,
  MemoryScope,
  RawMemoryDocument,
  RawMemoryFrontmatter,
} from '../contracts/memory-documents.js';
import { MEMORY_SCOPES } from '../contracts/memory-documents.js';
import { MEMORY_TYPES, type MemoryType } from '../prompts/memory-types.js';

type FrontmatterValue = string | boolean | string[];
type RenderableFrontmatter = RawMemoryFrontmatter | FinalMemoryFrontmatter;
const FILE_BLOCK_PATTERN =
  /<!--\s*FILE:\s*([^\s].*?)\s*-->\s*```markdown\s*([\s\S]*?)\s*```/g;
const OUTPUT_FILE_PATH_PATTERN =
  /^(?:(?:memories|memory)\/)?final\/(private|team)\/([A-Za-z0-9._-]+)\.md$/;
const INDEX_LINE_PATTERN = /^- \[[^\]]+\]\([A-Za-z0-9._-]+\.md\) — .+$/;

export function renderRawMemoryDocument(document: RawMemoryDocument): string {
  return [
    renderMarkdownFileBlock(
      document.filePath,
      [renderFrontmatter(document.frontmatter), document.body.trim()].join('\n\n'),
    ),
  ].join('\n');
}

export function renderFinalMemoryDocument(document: FinalMemoryDocument): string {
  return [
    renderFrontmatter(document.frontmatter),
    '',
    document.body.trim(),
  ].join('\n');
}

export function renderMemoryIndex(entries: MemoryIndexEntry[]): string {
  return entries.map(renderMemoryIndexLine).join('\n');
}

export function renderMemoryIndexLine(entry: MemoryIndexEntry): string {
  return `- [${entry.title}](${entry.filename}) — ${entry.hook}`;
}

export function renderMarkdownFileBlock(filePath: string, content: string): string {
  return [`<!-- FILE: ${filePath} -->`, '```markdown', content.trim(), '```'].join('\n');
}

export function parseFinalMemoryFileBlocks(markdown: string): FinalMemoryFileBlock[] {
  const trimmed = markdown.trim();
  const files: FinalMemoryFileBlock[] = [];
  let matchedAny = false;
  let cursor = 0;

  for (const match of trimmed.matchAll(FILE_BLOCK_PATTERN)) {
    const [, filePath, blockBody] = match;
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;

    if (trimmed.slice(cursor, matchStart).trim() !== '') {
      throw new Error('Malformed final memory output: found content outside a FILE markdown block.');
    }

    matchedAny = true;
    cursor = matchEnd;
    files.push({
      filePath: normalizeFinalMemoryOutputPath(filePath.trim()),
      content: blockBody.trim(),
    });
  }

  if (!matchedAny || trimmed.slice(cursor).trim() !== '') {
    throw new Error('Malformed final memory output: expected FILE comments followed by fenced markdown blocks.');
  }

  return files;
}

export function validateFinalMemoryFileBlocks(files: FinalMemoryFileBlock[]): FinalMemoryFileBlock[] {
  const seenPaths = new Set<string>();

  for (const file of files) {
    if (seenPaths.has(file.filePath)) {
      throw new Error(`Duplicate final memory file path: ${file.filePath}`);
    }
    seenPaths.add(file.filePath);

    if (file.filePath.endsWith('/MEMORY.md')) {
      validateMemoryIndexBlock(file.content);
      continue;
    }

    validateFinalMemoryDocument({
      filePath: file.filePath,
      ...parseFinalMemoryDocumentContent(file.filePath, file.content),
    });
  }

  return files;
}

function normalizeFinalMemoryOutputPath(filePath: string): string {
  const match = OUTPUT_FILE_PATH_PATTERN.exec(filePath);

  if (!match) {
    throw new Error(
      'Invalid final memory file path: expected "final/{scope}/{filename}.md" with optional "memory/" or "memories/" prefix.',
    );
  }

  const [, scope, filename] = match;
  return `final/${scope}/${filename}.md`;
}

function validateMemoryIndexBlock(content: string): void {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!INDEX_LINE_PATTERN.test(line)) {
      throw new Error(`Malformed MEMORY.md block: ${line}`);
    }
  }
}

function parseFinalMemoryDocumentContent(
  filePath: string,
  content: string,
): Omit<FinalMemoryDocument, 'filePath'> {
  const normalized = content.trim();

  if (!normalized.startsWith('---')) {
    throw new Error('Final memory document must start with frontmatter.');
  }

  const frontmatterEnd = normalized.indexOf('\n---', 3);
  if (frontmatterEnd === -1) {
    throw new Error('Final memory document is missing frontmatter terminator.');
  }

  const frontmatterBody = normalized.slice(4, frontmatterEnd).trim();
  const body = normalized.slice(frontmatterEnd + 4).trim();

  if (!body) {
    throw new Error(`Final memory document body cannot be empty: ${filePath}`);
  }

  return {
    frontmatter: parseFinalFrontmatter(frontmatterBody),
    body,
  };
}

function parseFinalFrontmatter(frontmatterBody: string): FinalMemoryFrontmatter {
  const entries = frontmatterBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator === -1) {
        throw new Error(`Invalid final memory frontmatter line: ${line}`);
      }

      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
    });

  const frontmatter = Object.fromEntries(entries) as Record<string, string>;

  return {
    name: requireNonEmpty(frontmatter.name, 'name'),
    description: requireNonEmpty(frontmatter.description, 'description'),
    type: parseMemoryType(frontmatter.type),
    scope: parseMemoryScope(frontmatter.scope),
    merged_from: parseMergedFrom(frontmatter.merged_from),
  };
}

function validateFinalMemoryDocument(document: FinalMemoryDocument): void {
  const scopeSegment = document.filePath.split('/')[1];
  if (scopeSegment !== document.frontmatter.scope) {
    throw new Error(
      `Final memory file path scope "${scopeSegment}" does not match frontmatter.scope "${document.frontmatter.scope}".`,
    );
  }
}

function parseMergedFrom(value: string | undefined): string[] {
  const normalized = requireNonEmpty(value, 'merged_from');
  const match = /^\[(.*)\]$/.exec(normalized);

  if (!match) {
    throw new Error('Invalid final memory frontmatter: merged_from must use array syntax.');
  }

  const items = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error('Invalid final memory frontmatter: merged_from must contain at least one source.');
  }

  return items;
}

function requireNonEmpty(value: string | undefined, key: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Invalid final memory frontmatter: missing required field "${key}".`);
  }

  return value.trim();
}

function parseMemoryType(value: string | undefined): MemoryType {
  const normalized = requireNonEmpty(value, 'type');

  if (!MEMORY_TYPES.includes(normalized as MemoryType)) {
    throw new Error(`Invalid final memory frontmatter: unsupported type "${normalized}".`);
  }

  return normalized as MemoryType;
}

function parseMemoryScope(value: string | undefined): MemoryScope {
  const normalized = requireNonEmpty(value, 'scope');

  if (!MEMORY_SCOPES.includes(normalized as MemoryScope)) {
    throw new Error(`Invalid final memory frontmatter: unsupported scope "${normalized}".`);
  }

  return normalized as MemoryScope;
}

function renderFrontmatter(fields: RenderableFrontmatter): string {
  return [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`),
    '---',
  ].join('\n');
}

function formatFrontmatterValue(value: RenderableFrontmatter[keyof RenderableFrontmatter]): string {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return value;
}
