/**
 * Association Engine
 *
 * Discovers relationships between blocks and builds a knowledge graph.
 * Rule-based association discovery with zero LLM dependency.
 */

import type { Block } from '../models/index.js';
import {
  AssociationType,
  AssociationDirection,
  type Association,
  type CreateAssociationInput,
  generateAssociationId,
  isBiDirectionalType,
} from '../models/association.js';

/**
 * Association engine configuration
 */
interface AssociationConfig {
  /** Similarity threshold above which two blocks are considered similar content */
  similarityThreshold: number;
  /** Weight applied to keyword overlap when scoring associations */
  keywordWeight: number;
  /** Weight applied to annotation match when scoring associations */
  annotationWeight: number;
  /** Time window in milliseconds within which content may be considered related */
  timeWindowMs: number;
}

/**
 * Association engine
 */
export class AssociationEngine {
  private config: AssociationConfig;

  constructor(config?: Partial<AssociationConfig>) {
    this.config = {
      similarityThreshold: 0.7,
      keywordWeight: 0.6,
      annotationWeight: 0.4,
      timeWindowMs: 3600000, // 1 hour
      ...config,
    };
  }

  /**
   * Discover associations between blocks using rule-based heuristics.
   *
   * @param blocks - List of blocks to analyze
   * @returns List of discovered associations
   */
  discoverByRules(blocks: Block[]): Association[] {
    const associations: Association[] = [];
    const n = blocks.length;

    // Pairwise comparison to find associations
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = blocks[i];
        const b = blocks[j];

        // Skip archived blocks
        if (a.status === 'archived' || b.status === 'archived') {
          continue;
        }

        // Check association types in priority order
        const conflicts = this.detectConflicts(a, b);
        if (conflicts) {
          associations.push(conflicts);
          continue; // Conflict takes priority; skip remaining checks
        }

        const supersedes = this.detectSupersedes(a, b);
        if (supersedes) {
          associations.push(supersedes);
          continue;
        }

        const refines = this.detectRefines(a, b);
        if (refines) {
          associations.push(refines);
        }

        const similar = this.detectSimilar(a, b);
        if (similar) {
          associations.push(similar);
        }

        const related = this.detectRelated(a, b);
        if (related) {
          associations.push(related);
        }
      }
    }

    return associations;
  }

  /**
   * Detect conflicting associations between decision-type blocks.
   *
   * Conflicts are identified when:
   * - Both blocks are decisions in the same domain
   * - They carry different choices for the same decision type
   */
  private detectConflicts(a: Block, b: Block): Association | null {
    // Only compare decision-type blocks
    if (!a.annotation.includes('决策') || !b.annotation.includes('决策')) {
      return null;
    }

    // Domains must match
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // Both must have a pattern
    if (!a.pattern || !b.pattern) {
      return null;
    }

    // Same decision category but different choices
    if (a.pattern.type === b.pattern.type && a.pattern.decision !== b.pattern.decision) {
      return {
        id: generateAssociationId(),
        from_id: a.id,
        to_id: b.id,
        type: AssociationType.CONFLICTS,
        direction: AssociationDirection.BI_DIRECTIONAL,
        confidence: 0.8,
        reason: `Conflicting decisions in the same domain: ${a.pattern.decision} vs ${b.pattern.decision}`,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * Detect superseding (replacement) associations.
   *
   * Conditions:
   * - Both blocks share the same annotation
   * - The newer block references or revises the older one
   * - The newer block is a more complete version of the older one
   */
  private detectSupersedes(a: Block, b: Block): Association | null {
    // Annotations must be identical
    if (a.annotation !== b.annotation) {
      return null;
    }

    // Establish chronological order
    const [older, newer] = a.created_at < b.created_at ? [a, b] : [b, a];

    // Check for update/revision language in the newer block
    const updateKeywords = [
      '修正',
      '更新',
      '改为',
      '改成',
      '变更',
      '新版本',
      '不再使用',
      '替换',
    ];

    const newerContent = newer.content.toLowerCase();
    const hasUpdateKeyword = updateKeywords.some((kw) => newerContent.includes(kw));

    if (!hasUpdateKeyword) {
      return null;
    }

    // Check whether the newer block mentions key terms from the older one
    const olderKeywords = this.extractKeywords(older.content).slice(0, 3);
    const mentionsOlder = olderKeywords.some((kw) => newer.content.includes(kw));

    if (mentionsOlder) {
      return {
        id: generateAssociationId(),
        from_id: newer.id,
        to_id: older.id,
        type: AssociationType.SUPERSEDES,
        direction: AssociationDirection.ONE_WAY,
        confidence: 0.75,
        reason: 'Newer version supersedes older version',
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * Detect refinement (elaboration) associations.
   *
   * Conditions:
   * - Both blocks share the same domain
   * - One is significantly shorter/more abstract, the other longer/more specific
   * - They were created within the configured time window
   */
  private detectRefines(a: Block, b: Block): Association | null {
    // Domains must match
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // Identify which block is more detailed
    const [shorter, longer] =
      a.content.length < b.content.length ? [a, b] : [b, a];

    // The longer must be at least 2x the length of the shorter
    if (longer.content.length < shorter.content.length * 2) {
      return null;
    }

    // Both must have been created within the time window
    const timeDiff = Math.abs(longer.created_at - shorter.created_at);
    if (timeDiff > this.config.timeWindowMs) {
      return null;
    }

    // The longer block must mention keywords from the shorter block
    const shorterKeywords = this.extractKeywords(shorter.content);
    const mentionsKeywords = shorterKeywords.filter((kw) =>
      longer.content.toLowerCase().includes(kw.toLowerCase())
    );

    if (mentionsKeywords.length >= 2) {
      return {
        id: generateAssociationId(),
        from_id: longer.id,
        to_id: shorter.id,
        type: AssociationType.REFINES,
        direction: AssociationDirection.ONE_WAY,
        confidence: 0.7,
        reason: 'More detailed elaboration',
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * Detect similarity associations.
   *
   * Conditions:
   * - Both blocks have identical annotations
   * - Content similarity exceeds the configured threshold
   */
  private detectSimilar(a: Block, b: Block): Association | null {
    // Annotations must be identical
    if (a.annotation !== b.annotation) {
      return null;
    }

    const similarity = this.calculateSimilarity(a.content, b.content);

    if (similarity >= this.config.similarityThreshold) {
      const direction = isBiDirectionalType(AssociationType.SIMILAR)
        ? AssociationDirection.BI_DIRECTIONAL
        : AssociationDirection.ONE_WAY;

      return {
        id: generateAssociationId(),
        from_id: a.id,
        to_id: b.id,
        type: AssociationType.SIMILAR,
        direction,
        confidence: similarity,
        reason: `Content similarity ${(similarity * 100).toFixed(0)}%`,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * Detect general relatedness associations.
   *
   * Conditions:
   * - Both blocks are in the same domain
   * - They share a sufficient number of keywords (Jaccard ≥ 0.3)
   */
  private detectRelated(a: Block, b: Block): Association | null {
    // Domains must match
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // Extract keywords and measure overlap
    const aKeywords = this.extractKeywords(a.content);
    const bKeywords = this.extractKeywords(b.content);

    const commonKeywords = aKeywords.filter((kw) =>
      bKeywords.some((bk) => kw.toLowerCase() === bk.toLowerCase())
    );

    // Require at least 2 shared keywords
    if (commonKeywords.length < 2) {
      return null;
    }

    // Compute Jaccard similarity on keyword sets
    const unionSize = new Set([...aKeywords, ...bKeywords]).size;
    const jaccard = commonKeywords.length / unionSize;

    if (jaccard >= 0.3) {
      const direction = isBiDirectionalType(AssociationType.RELATED)
        ? AssociationDirection.BI_DIRECTIONAL
        : AssociationDirection.ONE_WAY;

      return {
        id: generateAssociationId(),
        from_id: a.id,
        to_id: b.id,
        type: AssociationType.RELATED,
        direction,
        confidence: Math.min(jaccard + 0.3, 0.9), // Boost into a meaningful confidence range
        reason: `Shared keywords: ${commonKeywords.slice(0, 3).join(', ')}`,
        context_tags: commonKeywords,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * Calculate textual similarity between two strings.
   *
   * Uses simplified Jaccard similarity over word sets.
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractWords(text1);
    const words2 = this.extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // Jaccard similarity: |intersection| / |union|
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Extract meaningful keywords from text.
   *
   * Handles both Chinese characters and English words; filters common stop words.
   */
  private extractKeywords(text: string): string[] {
    const words = this.extractWords(text);

    // Filter stop words for both Chinese and English
    const stopWords = new Set([
      '的', '了', '是', '在', '有', '和', '就', '不', '人', '都',
      '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
      '会', '着', '没有', '看', '好', '自己', '这', 'the', 'a', 'an',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
      'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    ]);

    return [...new Set(words)]
      .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
      .slice(0, 10); // Cap at 10 keywords
  }

  /**
   * Extract all words (tokens) from text, supporting both Chinese and English.
   */
  private extractWords(text: string): string[] {
    // Chinese: split by character, filter punctuation
    const chineseChars = text
      .match(/[\u4e00-\u9fa5]/g)
      ?.filter((c) => !/[，。！？、；：""''（）【】《》]/.test(c)) || [];

    // English: extract lowercase words
    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    return [...chineseChars, ...englishWords];
  }

  /**
   * Extract the domain segment from an annotation string.
   *
   * Annotation format: "nature · domain · tag"
   */
  private extractDomain(annotation: string): string {
    const parts = annotation.split(' · ');
    return parts.length >= 2 ? parts[1] : '';
  }
}
