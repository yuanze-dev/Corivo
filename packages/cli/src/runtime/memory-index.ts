import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from '@/infrastructure/storage/lifecycle/database-paths.js';
import type { QueryPack } from './query-pack.js';
import type { CorivoSurfaceItem } from './types.js';

const INDEX_LINE_PATTERN = /^- \[([^\]]+)\]\(([^)]+)\) — (.+)$/;
const DETAIL_BODY_PATTERN = /^\s*---[\s\S]*?\n---\s*([\s\S]*)$/;

export interface MemoryIndexEntry {
  scope: 'private' | 'team';
  title: string;
  filename: string;
  hook: string;
  detailPath: string;
  detailContent?: string;
}

export async function loadMemoryIndex(configDir = getConfigDir()): Promise<MemoryIndexEntry[]> {
  const scopes = ['private', 'team'] as const;
  const entries: MemoryIndexEntry[] = [];

  for (const scope of scopes) {
    const indexPath = path.join(configDir, 'memory', 'final', scope, 'MEMORY.md');
    let rawIndex: string;
    try {
      rawIndex = await fs.readFile(indexPath, 'utf8');
    } catch {
      continue;
    }

    for (const line of rawIndex.split('\n').map((item) => item.trim()).filter(Boolean)) {
      const match = INDEX_LINE_PATTERN.exec(line);
      if (!match) {
        continue;
      }

      const [, title, filename, hook] = match;
      const detailPath = path.join(configDir, 'memory', 'final', scope, filename);
      entries.push({
        scope,
        title,
        filename,
        hook,
        detailPath,
        detailContent: await readDetailContent(detailPath),
      });
    }
  }

  return entries;
}

export function recallFromMemoryIndex(
  entries: MemoryIndexEntry[],
  queryPack: QueryPack,
): CorivoSurfaceItem | null {
  const scored = entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, queryPack),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = scored[0];
  if (!selected) {
    return null;
  }

  return {
    mode: selected.score >= 2 ? 'recall' : 'uncertain',
    confidence: selected.score >= 2 ? 'high' : 'low',
    whyNow: '当前提问与已生成的 Markdown memory index 直接相关。',
    claim: selected.entry.detailContent || selected.entry.hook,
    evidence: [`memory-index:${selected.entry.scope}/${selected.entry.filename}`],
    memoryIds: [`memory-index:${selected.entry.scope}/${selected.entry.filename}`],
  };
}

async function readDetailContent(detailPath: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(detailPath, 'utf8');
    const match = DETAIL_BODY_PATTERN.exec(raw);
    const body = (match?.[1] ?? raw).trim();
    return body || undefined;
  } catch {
    return undefined;
  }
}

function scoreEntry(entry: MemoryIndexEntry, queryPack: QueryPack): number {
  const haystack = `${entry.title} ${entry.hook} ${entry.detailContent ?? ''}`.toLowerCase();
  const anchorTerms = queryPack.anchorTerms.map((term) => term.toLowerCase());
  const termMatches = anchorTerms.filter((term) => haystack.includes(term)).length;
  const promptMatch = queryPack.anchorText && haystack.includes(queryPack.anchorText.toLowerCase()) ? 2 : 0;
  return termMatches + promptMatch;
}
