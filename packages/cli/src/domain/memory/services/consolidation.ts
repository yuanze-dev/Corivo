/**
 * integration engine
 *
 * Responsible for merging duplicate content, refining upper-level knowledge, and completing related links
 * Simulate the process of the human brain sorting out memories during sleep
 */

import type { Block } from '@/domain/memory/models/index.js';
import { AssociationType, AssociationDirection } from '@/domain/memory/models/association.js';

/**
 * Integrate results
 */
export interface ConsolidationResult {
  /** Type of operation performed */
  action: 'merged' | 'linked';
  /** Involved block ID */
  blocks: string[];
  /** Result block (if any) */
  result?: Block;
  /** Justification */
  reason?: string;
}

/**
 * Integrated configuration
 */
interface ConsolidationConfig {
  /** Similarity threshold (above this value it is considered necessary to merge) */
  mergeThreshold: number;
  /** Automatic chain link confidence threshold */
  linkThreshold: number;
}

/**
 * integration engine
 */
export class ConsolidationEngine {
  private config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = {
      mergeThreshold: 0.85,
      linkThreshold: 0.7,
      ...config,
    };
  }

  /**
   * Deduplication: merge highly similar blocks
   *
   * @param candidates - list of blocks to be checked
   * @returns merged result list
   */
  deduplicateBlocks(candidates: Block[]): ConsolidationResult[] {
    const results: ConsolidationResult[] = [];
    const processed = new Set<string>();

    for (const block of candidates) {
      if (processed.has(block.id)) {
        continue;
      }

      // Find similar blocks
      const similar = this.findSimilarBlocks(block, candidates);

      if (similar.length > 0) {
        // merge into first block
        const merged = this.mergeBlocks(block, similar);
        results.push(merged);

        // Mark as processed
        processed.add(block.id);
        for (const s of similar) {
          processed.add(s.id);
        }
      }
    }

    return results;
  }

  /**
   * Complementary chain: Add associations to blocks that are related but have no refs
   *
   * @param blocks - list of blocks
   * @param associations - list of existing associations
   * @returns block ID mapping that needs to be updated
   */
  findMissingLinks(
    blocks: Block[],
    associations: Array<{ from_id: string; to_id: string; confidence: number }>
  ): Map<string, string[]> {
    const missingLinks = new Map<string, string[]>();

    // For each block, find blocks that are associated with high confidence but are not in refs
    for (const block of blocks) {
      const currentRefs = new Set(block.refs);

      // Find objects that are associated with high confidence but are not in refs
      const highConfLinks = associations
        .filter(
          (a) =>
            (a.from_id === block.id || a.to_id === block.id) &&
            a.confidence >= this.config.linkThreshold
        )
        .map((a) => (a.from_id === block.id ? a.to_id : a.from_id))
        .filter((id) => !currentRefs.has(id));

      if (highConfLinks.length > 0) {
        missingLinks.set(block.id, highConfLinks);
      }
    }

    return missingLinks;
  }

  /**
   * Find similar blocks
   */
  private findSimilarBlocks(target: Block, candidates: Block[]): Block[] {
    const similar: Block[] = [];

    for (const candidate of candidates) {
      if (candidate.id === target.id) {
        continue;
      }

      // Labels must be the same
      if (candidate.annotation !== target.annotation) {
        continue;
      }

      const similarity = this.calculateSimilarity(target.content, candidate.content);

      if (similarity >= this.config.mergeThreshold) {
        similar.push(candidate);
      }
    }

    return similar;
  }

  /**
   * merge blocks
   *
   * Keep the one with the longest and latest content as the main block, and record the others to consolidated_from
   */
  private mergeBlocks(primary: Block, duplicates: Block[]): ConsolidationResult {
    // Find the longest content as the main block
    const all = [primary, ...duplicates];
    all.sort((a, b) => b.content.length - a.content.length);

    const main = all[0];
    const others = all.slice(1);

    // Merge refs (remove duplication)
    const allRefs = new Set<string>();
    allRefs.add(main.id);
    for (const b of all) {
      b.refs.forEach((r) => allRefs.add(r));
    }

    // Calculate new vitality (take the highest value)
    const maxVitality = Math.max(...all.map((b) => b.vitality));

    const mergedBlock: Block = {
      ...main,
      refs: [...allRefs],
      vitality: maxVitality,
      updated_at: Math.floor(Date.now() / 1000),
    };

    return {
      action: 'merged',
      blocks: [main.id, ...others.map((b) => b.id)],
      result: mergedBlock,
      reason: `合并了 ${duplicates.length} 个相似内容`,
    };
  }

  /**
   * Calculate the similarity between two texts
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractWords(text1);
    const words2 = this.extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // Jaccard similarity
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Extract all words in text
   */
  private extractWords(text: string): string[] {
    const chineseChars = text
      .match(/[\u4e00-\u9fa5]/g)
      ?.filter((c) => !/[，。！？、；：""''（）【】《》]/.test(c)) || [];

    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    return [...chineseChars, ...englishWords];
  }

}
