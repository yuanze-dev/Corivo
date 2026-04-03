/**
 * rules engine
 *
 * Extract structured decision patterns from natural language content
 */

import type { Pattern } from '@/domain/memory/models/pattern.js';

/**
 * Rule interface
 */
export interface Rule {
  /** Rule name */
  name: string;
  /** Match pattern list */
  patterns: RegExp[];
  /** Extract patterns from content */
  extract(content: string): Pattern | null;
}

/**
 * rules engine
 *
 * Manage multiple rules, sequentially trying to match and extract patterns
 */
export class RuleEngine {
  private rules: Rule[] = [];

  /**
   * Registration rules
   */
  register(rule: Rule): void {
    this.rules.push(rule);
  }

  /**
   * Extract patterns from content
   *
   * @param content - natural language content
   * @returns the extracted pattern, or null if there is no match
   */
  extract(content: string): Pattern | null {
    for (const rule of this.rules) {
      const pattern = rule.extract(content);
      if (pattern) {
        return { ...pattern, _source: 'rule' as const };
      }
    }
    return null;
  }

  /**
   * Batch extraction (for testing)
   *
   * @param contents - content array
   * @returns extracted pattern array
   */
  extractAll(contents: string[]): (Pattern | null)[] {
    return contents.map((c) => this.extract(c));
  }

  /**
   * Get the number of registered rules
   */
  get ruleCount(): number {
    return this.rules.length;
  }
}
