import type {
  FinalMemoryDocument,
  MemoryIndexEntry,
  RawMemoryDocument,
} from '../contracts/memory-documents.js';

export function renderRawMemoryDocument(document: RawMemoryDocument): string {
  return [
    `<!-- FILE: ${document.filePath} -->`,
    '```markdown',
    renderFrontmatter({
      ...document.frontmatter,
      source_session: document.frontmatter.source_session,
    }),
    '',
    document.body.trim(),
    '```',
  ].join('\n');
}

export function renderFinalMemoryDocument(document: FinalMemoryDocument): string {
  return [
    renderFrontmatter({
      ...document.frontmatter,
      merged_from: `[${document.frontmatter.merged_from.join(', ')}]`,
    }),
    '',
    document.body.trim(),
  ].join('\n');
}

export function renderMemoryIndex(entries: MemoryIndexEntry[]): string {
  return entries.map(renderMemoryIndexLine).join('\n');
}

export function renderMemoryIndexLine(entry: MemoryIndexEntry): string {
  return `- [${entry.title}](${entry.filename}) - ${entry.hook}`;
}

function renderFrontmatter(fields: Record<string, string>): string {
  return ['---', ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), '---'].join(
    '\n',
  );
}
