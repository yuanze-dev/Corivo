import { AssociationType, type Association } from '../models/association.js';
import type { Block } from '../models/block.js';
import type { QueryPack } from './query-pack.js';

export interface RuntimeDatabase {
  queryBlocks: (filter?: Record<string, unknown>) => Block[];
  searchBlocks: (query: string, limit?: number) => Block[];
  getBlockAssociations: (blockId: string, minConfidence?: number) => Association[];
  getBlock: (id: string) => Block | null;
}

export interface CandidateRecord {
  block: Block;
  associations: Association[];
}

function dedupeBlocks(blocks: Block[]): Block[] {
  const seen = new Set<string>();
  const unique: Block[] = [];

  for (const block of blocks) {
    if (seen.has(block.id)) {
      continue;
    }
    seen.add(block.id);
    unique.push(block);
  }

  return unique;
}

export function collectCandidates(db: RuntimeDatabase, queryPack: QueryPack): CandidateRecord[] {
  const queries = [queryPack.anchorText, ...queryPack.anchorTerms].filter(Boolean);
  const directMatches = dedupeBlocks(
    queries.flatMap((query) => db.searchBlocks(query, 5)),
  ).filter((block) => block.status !== 'archived');

  return directMatches.map((block) => ({
    block,
    associations: db.getBlockAssociations(block.id, 0.5),
  }));
}

export function hasTensionAssociation(associations: Association[]): boolean {
  return associations.some((association) =>
    association.type === AssociationType.CONFLICTS ||
    association.type === AssociationType.SUPERSEDES,
  );
}
