import type { Block } from '@/domain/memory/models/block.js';
import type { QueryPack } from './query-pack.js';

const CHANGE_PATTERNS = /(replace|switch|migrate|move|change|drop|swap|改|换|迁移|替换)/i;
const UNFINISHED_PATTERNS = /(未|待|todo|还没|未定|收尾|确认)/i;

export function countAnchorMatches(block: Block, queryPack: QueryPack): number {
  const haystack = `${block.content} ${block.annotation}`.toLowerCase();

  return queryPack.anchorTerms.reduce((count, term) => (
    haystack.includes(term.toLowerCase()) ? count + 1 : count
  ), 0);
}

export function isDecisionBlock(block: Block): boolean {
  return block.annotation.includes('决策');
}

export function extractKeywords(content: string): string[] {
  const words = content.toLowerCase().match(/[a-z]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  return [...new Set(words)].slice(0, 10);
}

export function extractDecisionLabel(block: Block): string {
  if (block.pattern && typeof block.pattern === 'object' && 'decision' in block.pattern) {
    return (block.pattern as { decision: string }).decision;
  }

  const parts = block.annotation.split(' · ');
  if (parts.length >= 3) {
    return parts[2];
  }

  return block.content.slice(0, 20);
}

export function hasChangeIntent(queryPack: QueryPack): boolean {
  return CHANGE_PATTERNS.test(queryPack.anchorText);
}

export function isUnfinishedBlock(block: Block): boolean {
  return UNFINISHED_PATTERNS.test(block.content);
}

export function scoreCarryOverBlock(block: Block, now?: number): number {
  let score = 0;

  if (isDecisionBlock(block)) {
    score += 3;
  }

  if (isUnfinishedBlock(block)) {
    score += 4;
  }

  if (block.status === 'active') {
    score += 2;
  } else if (block.status === 'cooling') {
    score += 1;
  }

  if (typeof now === 'number') {
    const ageSeconds = Math.max(0, now - block.updated_at);
    if (ageSeconds <= 14 * 86400) {
      score += 1;
    }
  }

  return score;
}
