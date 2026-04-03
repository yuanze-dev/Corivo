import type { MemoryType } from '../prompts/memory-types.js';

export const MEMORY_SCOPES = ['private', 'team'] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export interface BaseMemoryFrontmatter {
  name: string;
  description: string;
  type: MemoryType;
  scope: MemoryScope;
}

export interface RawMemoryFrontmatter extends BaseMemoryFrontmatter {
  source_session: string;
  forget?: boolean | string;
}

export interface RawMemoryItem {
  frontmatter: RawMemoryFrontmatter;
  body: string;
}

export interface FinalMemoryFrontmatter extends BaseMemoryFrontmatter {
  merged_from: string[];
}

export interface RawMemoryDocument extends RawMemoryItem {
  filePath: string;
}

export interface FinalMemoryDocument {
  filePath: string;
  frontmatter: FinalMemoryFrontmatter;
  body: string;
}

export interface ParsedRawMemoryDocument {
  noMemories: boolean;
  items: RawMemoryItem[];
  documents?: RawMemoryDocument[];
}

export interface MemoryIndexEntry {
  title: string;
  filename: string;
  hook: string;
}

export interface RawMemoryBatchArtifact {
  sessionId: string;
  items: RawMemoryItem[];
}

export interface FinalMemoryFileBlock {
  filePath: string;
  content: string;
}

export interface FinalMemoryBatchArtifact {
  files: string[];
}
