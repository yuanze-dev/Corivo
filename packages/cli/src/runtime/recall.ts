import type { QueryPack } from './query-pack.js';
import type { MemoryIndexEntry } from './memory-index.js';
import type { CorivoSurfaceItem } from './types.js';
import { collectCandidates, hasTensionAssociation, type RuntimeDatabase } from './retrieval.js';
import { countAnchorMatches, hasChangeIntent, isDecisionBlock } from './scoring.js';
import { recallFromMemoryIndex } from './memory-index.js';

export function generateRecall(
  db: RuntimeDatabase,
  queryPack: QueryPack,
  options: {
    memoryIndex?: MemoryIndexEntry[];
  } = {},
): CorivoSurfaceItem | null {
  const memoryIndexResult = options.memoryIndex
    ? recallFromMemoryIndex(options.memoryIndex, queryPack)
    : null;
  if (memoryIndexResult) {
    return memoryIndexResult;
  }

  const candidates = collectCandidates(db, queryPack)
    .map((candidate) => ({
      ...candidate,
      anchorMatches: countAnchorMatches(candidate.block, queryPack),
      tension: hasTensionAssociation(candidate.associations),
    }))
    .sort((left, right) => right.anchorMatches - left.anchorMatches);

  const selected = candidates[0];
  if (!selected || selected.anchorMatches === 0) {
    return null;
  }

  if ((selected.tension || hasChangeIntent(queryPack)) && isDecisionBlock(selected.block)) {
    return {
      mode: 'challenge',
      confidence: selected.anchorMatches >= 2 ? 'high' : 'medium',
      whyNow: '当前提问看起来正在推动一个已经存在的决策发生变化。',
      claim: selected.block.content,
      evidence: [selected.block.annotation],
      memoryIds: [selected.block.id],
      suggestedAction: '先确认是否要推翻旧决策。',
    };
  }

  if (selected.anchorMatches >= 2 && isDecisionBlock(selected.block)) {
    return {
      mode: 'recall',
      confidence: 'high',
      whyNow: '当前提问和已有决策直接相关。',
      claim: selected.block.content,
      evidence: [selected.block.annotation],
      memoryIds: [selected.block.id],
    };
  }

  return {
    mode: 'uncertain',
    confidence: 'low',
    whyNow: '当前提问和历史记忆存在弱锚点，但相关性仍不完全确定。',
    claim: selected.block.content,
    evidence: [selected.block.annotation],
    memoryIds: [selected.block.id],
  };
}
