import type {
  FinalMemoryFileBlock,
  FinalMemoryDocument,
  FinalMemoryFrontmatter,
  MemoryIndexEntry,
  RawMemoryDocument,
  RawMemoryFrontmatter,
} from '../contracts/memory-documents.js';

type FrontmatterValue = string | boolean | string[];
type RenderableFrontmatter = RawMemoryFrontmatter | FinalMemoryFrontmatter;
const FILE_BLOCK_PATTERN =
  /<!--\s*FILE:\s*([^\s].*?)\s*-->\s*```markdown\s*([\s\S]*?)\s*```/g;
const OUTPUT_FILE_PATH_PATTERN =
  /^(?:(?:memories|memory)\/)?final\/(private|team)\/([A-Za-z0-9._-]+)\.md$/;

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
