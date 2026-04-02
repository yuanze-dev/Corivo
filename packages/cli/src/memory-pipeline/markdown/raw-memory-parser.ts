import type {
  ParsedRawMemoryDocument,
  RawMemoryDocument,
  RawMemoryFrontmatter,
} from '../contracts/memory-documents.js';

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

  for (const match of trimmed.matchAll(FILE_BLOCK_PATTERN)) {
    const [, filePath, blockBody] = match;
    documents.push({
      filePath: filePath.trim(),
      ...parseMarkdownBlock(blockBody),
    });
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

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    type: frontmatter.type as RawMemoryFrontmatter['type'],
    scope: frontmatter.scope as RawMemoryFrontmatter['scope'],
    source_session: frontmatter.source_session,
    ...(frontmatter.forget ? { forget: frontmatter.forget } : {}),
  };
}
