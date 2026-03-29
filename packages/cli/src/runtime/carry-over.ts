import type { CorivoSurfaceItem } from './types.js';
import { scoreCarryOverBlock } from './scoring.js';
import type { RuntimeDatabase } from './retrieval.js';

export function generateCarryOver(
  db: RuntimeDatabase,
  options: { now?: number } = {},
): CorivoSurfaceItem | null {
  const candidates = db.queryBlocks({ limit: 50 })
    .filter((block) => block.status !== 'archived')
    .map((block) => ({
      block,
      score: scoreCarryOverBlock(block, options.now),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0]?.block;
  if (!selected) {
    return null;
  }

  return {
    mode: 'carry_over',
    confidence: 'medium',
    whyNow: '这是最近仍未收尾、适合在开场带回来的记忆。',
    claim: selected.content,
    evidence: [selected.annotation],
    memoryIds: [selected.id],
  };
}
