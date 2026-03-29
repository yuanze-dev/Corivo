import type { QueryPack } from './query-pack.js';
import type { CorivoSurfaceItem } from './types.js';
import { collectCandidates, type RuntimeDatabase } from './retrieval.js';
import { countAnchorMatches, isUnfinishedBlock } from './scoring.js';

export function generateReview(
  db: RuntimeDatabase,
  queryPack: QueryPack,
): CorivoSurfaceItem | null {
  const candidates = collectCandidates(db, queryPack)
    .map((candidate) => ({
      block: candidate.block,
      anchorMatches: countAnchorMatches(candidate.block, queryPack),
    }))
    .filter((candidate) => candidate.anchorMatches > 0 && isUnfinishedBlock(candidate.block))
    .sort((left, right) => right.anchorMatches - left.anchorMatches);

  const selected = candidates[0];
  if (!selected) {
    return null;
  }

  return {
    mode: 'review',
    confidence: selected.anchorMatches >= 2 ? 'medium' : 'low',
    whyNow: 'Claude 刚刚提到了一个仍未收尾的话题，适合在答后补一句。',
    claim: selected.block.content,
    evidence: [selected.block.annotation],
    memoryIds: [selected.block.id],
  };
}
