import type {
  FinalMemoryDocument,
  FinalMemoryFrontmatter,
  MemoryIndexEntry,
  RawMemoryDocument,
  RawMemoryFrontmatter,
} from '../contracts/memory-documents.js';

type FrontmatterValue = string | boolean | string[];
type RenderableFrontmatter = RawMemoryFrontmatter | FinalMemoryFrontmatter;

export function renderRawMemoryDocument(document: RawMemoryDocument): string {
  return [
    `<!-- FILE: ${document.filePath} -->`,
    '```markdown',
    renderFrontmatter(document.frontmatter),
    '',
    document.body.trim(),
    '```',
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
