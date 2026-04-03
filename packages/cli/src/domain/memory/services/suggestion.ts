/**
 * Context Suggestion Engine
 *
 * Predict what the user is likely to type next from long-term memory
 *
 * Core philosophy (inspired by Claude Code v2):
 * "Predict what the user will type, not what you think they should do."
 */

import type { CorivoDatabase } from '@/storage/database';
import type { Block } from '../models/block.js';

/**
 * Suggestion context
 */
export enum SuggestionContext {
  SESSION_START = 'session-start',
  POST_REQUEST = 'post-request',
}

/**
 * Suggestion generation settings
 */
export interface SuggestionConfig {
  /** Maximum number of suggestions */
  maxSuggestions?: number;
  /** Preferred age window, in days */
  preferredAgeDays?: [number, number];
  /** Minimum vitality */
  minVitality?: number;
}

/**
 * Suggestion result
 */
export interface Suggestion {
  /** Suggestion text, without the `[corivo]` prefix */
  content: string;
  /** Source Block ID */
  blockId: string;
  /** Confidence */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Suggestion engine
 */
export class SuggestionEngine {
  private db: CorivoDatabase;
  private config: Required<SuggestionConfig>;

  constructor(db: CorivoDatabase, config: SuggestionConfig = {}) {
    this.db = db;
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 1,
      preferredAgeDays: config.preferredAgeDays ?? [3, 7],
      minVitality: config.minVitality ?? 40,
    };
  }

  /**
   * Generate a suggestion
   *
   * @param context Suggestion context
   * @param lastMessage Claude's last reply, used to decide whether Corivo should yield
   * @returns Suggestion text with the `[corivo]` prefix, or an empty string
   */
  generate(context: SuggestionContext, lastMessage?: string): string {
    // Yield when POST_REQUEST already includes an obvious next step from Claude
    if (context === SuggestionContext.POST_REQUEST && lastMessage) {
      if (this.hasObviousNextStep(lastMessage)) {
        return ''; // Let Claude Code handle it
      }
    }

    // Gather candidate blocks
    const candidates = this.getCandidateBlocks(context);

    // Debug logging
    // console.error('candidates:', candidates.length);

    if (candidates.length === 0) {
      return '';
    }

    // Build the final suggestion
    const suggestion = this.buildSuggestion(candidates[0]);

    // Debug logging
    // console.error('suggestion:', suggestion);

    return suggestion ? `[corivo] ${suggestion}` : '';
  }

  /**
   * Determine whether Claude's reply already suggests an obvious next step
   */
  private hasObviousNextStep(message: string): boolean {
    const lower = message.toLowerCase();

    // Clear completion signals are better handled by Claude Code itself
    const completionSignals = [
      'bug.*fix',
      '修复.*bug',
      'fix.*完成',
      '代码.*完成',
      '写完了',
      'implemented',
      'done',
      'finished',
      'complete',
      '测试.*通过',
      'tests.*pass',
    ];

    for (const signal of completionSignals) {
      if (new RegExp(signal, 'i').test(lower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get candidate blocks
   */
  private getCandidateBlocks(context: SuggestionContext = SuggestionContext.SESSION_START): Block[] {
    const now = Math.floor(Date.now() / 1000);

    // Start from currently active blocks
    const blocks = this.db.queryBlocks({
      limit: 50,
    });

    // Filter down to the most relevant candidates
    return blocks.filter((block) => {
      // Enforce the vitality threshold
      if (block.vitality < this.config.minVitality) {
        return false;
      }

      // Only consider active or cooling blocks
      if (block.status !== 'active' && block.status !== 'cooling') {
        return false;
      }

      // On session start, prioritize important decisions from the last 24 hours
      if (context === SuggestionContext.SESSION_START) {
        const oneDayAgo = now - 86400;
        // Always keep recent decision blocks from the past day
        if (block.annotation.includes('决策') && block.created_at > oneDayAgo) {
          return true;
        }
        // Otherwise fall through to the default age window
      }

      // Apply the normal age window so memories are neither too fresh nor too stale
      const [minAge, maxAge] = this.config.preferredAgeDays;
      const minTime = now - (maxAge * 86400);
      const maxTime = now - (minAge * 86400);

      if (block.created_at < minTime || block.created_at > maxTime) {
        // Session start gets a wider window: 1 to 14 days old
        if (context === SuggestionContext.SESSION_START) {
          const sessionMinTime = now - (14 * 86400);
          const sessionMaxTime = now - 86400;
          if (block.created_at < sessionMinTime || block.created_at > sessionMaxTime) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Prefer decision blocks
      if (block.annotation.includes('决策')) {
        return true;
      }

      // Then consider unresolved fact blocks
      if (block.annotation.includes('事实') && block.refs.length === 0) {
        return true;
      }

      return false;
    }).sort((a, b) => {
      // Sort by vitality
      return b.vitality - a.vitality;
    }).slice(0, this.config.maxSuggestions);
  }

  /**
   * Build the suggestion text
   */
  private buildSuggestion(block: Block): string | null {
    const annotation = block.annotation;
    const content = block.content;

    // Parse the annotation triple
    const parts = annotation.split(' · ');
    const nature = parts[0]; // Nature: decision/fact/knowledge
    const domain = parts[1]; // Domain: self/people/project/asset/knowledge
    const tag = parts[2];    // Tag

    // Generate the suggestion based on annotation type
    if (nature === '决策') {
      return this.buildDecisionSuggestion(block, domain, tag);
    }

    if (nature === '事实' && domain === 'people') {
      return this.buildPeopleSuggestion(content);
    }

    // Default to deriving the suggestion from the content itself
    return this.buildGenericSuggestion(content, tag);
  }

  /**
   * Decision-oriented suggestion
   */
  private buildDecisionSuggestion(block: Block, domain: string, tag: string): string {
    // If there is Pattern (technical selection), extract the decision
    if (block.pattern && 'decision' in block.pattern) {
      const decision = (block.pattern as any).decision;
      return `继续 ${decision} 的实施`;
    }

    // Generate from the tag
    if (tag) {
      return `继续做 ${tag}`;
    }

    // Generate from the content
    const content = block.content.slice(0, 20);
    return `继续 "${content}"`;
  }

  /**
   * Staff related suggestions
   */
  private buildPeopleSuggestion(content: string): string {
    // Extract person name or task
    const match = content.match(/(.{0,15})/);
    const task = match ? match[1].trim() : '事项';
    return `跟进 ${task}`;
  }

  /**
   * General advice
   */
  private buildGenericSuggestion(content: string, tag: string): string {
    // Limit content length
    const short = content.slice(0, 15);

    if (tag && tag !== '通用' && tag !== '一般') {
      return `检查 ${tag}`;
    }

    return `关于 "${short}" 的进展`;
  }
}

export default SuggestionEngine;
