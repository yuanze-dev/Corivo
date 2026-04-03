/**
 * Contradiction detector
 *
 * Check whether newly saved content conflicts with existing content
 * Remind like a friend: "But what you said before is..."
 */

import type { Block } from '@/domain/memory/models/index.js';

/**
 * type of contradiction
 */
enum ConflictType {
  DECISION_CHANGE = 'decision_change', // decision change
  VALUE_CONFLICT = 'value_conflict',   // conflict of values
  FACT_CONFLICT = 'fact_conflict',     // conflict of facts
}

/**
 * Conflict reminder
 */
export interface ConflictReminder {
  hasConflict: boolean;
  message: string;
  conflictingBlocks: Block[];
}

/**
 * Contradiction detector
 */
export class ConflictDetector {
  /**
   * Check whether new content conflicts with existing content
   *
   * @param newContent - the newly saved content
   * @param existingBlocks - list of existing blocks
   * @returns conflict reminder, if there is no conflict, return null
   */
  detect(newContent: string, existingBlocks: Block[]): ConflictReminder | null {
    // Only detect decision-making content
    const decisions = existingBlocks.filter((b) =>
      b.annotation.includes('决策') && b.status !== 'archived'
    );

    if (decisions.length === 0) {
      return null;
    }

    const conflicting: Block[] = [];

    // Detect decision changes
    for (const decision of decisions) {
      if (this.isDecisionChange(newContent, decision.content)) {
        conflicting.push(decision);
      }
    }

    if (conflicting.length === 0) {
      return null;
    }

    // Generate friendly reminders
    const message = this.generateReminderMessage(newContent, conflicting);

    return {
      hasConflict: true,
      message,
      conflictingBlocks: conflicting,
    };
  }

  /**
   * Check whether it is a decision change
   *
   * Rule: Before it said "Choose X", now it says "Choose Y" (X ≠ Y)
   */
  private isDecisionChange(newContent: string, oldContent: string): boolean {
    // Extract decision content
    const oldDecision = this.extractDecision(oldContent);
    const newDecision = this.extractDecision(newContent);

    if (!oldDecision || !newDecision) {
      return false;
    }

    // Different fields, not a contradiction
    const oldDomain = this.extractDomain(oldContent);
    const newDomain = this.extractDomain(newContent);

    if (oldDomain !== newDomain) {
      return false;
    }

    // Different decisions are regarded as contradictions
    return oldDecision !== newDecision &&
           this.isSimilarTopic(oldContent, newContent);
  }

  /**
   * Extract decision content
   */
  private extractDecision(content: string): string | null {
    // Match "choose X", "decide X", "adopt X", "use X"
    const patterns = [
      /选择(?:了)?(?:使用)?用\s+([^\u3000-\u303f\s,。,，.]+)/,
      /决定(?:了)?(?:使用)?\s+([^\u3000-\u303f\s,。,，.]+)/,
      /采用\s+([^\u3000-\u303f\s,。,，.]+)/,
      /使用\s+([^\u3000-\u303f\s,。,，.]+)/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract fields
   */
  private extractDomain(content: string): string {
    // Extracted from annotation, simplified processing here
    if (content.includes('框架') || content.includes('库') || content.includes('React') || content.includes('Vue')) {
      return 'frontend';
    }
    if (content.includes('后端') || content.includes('API') || content.includes('数据库')) {
      return 'backend';
    }
    if (content.includes('部署') || content.includes('CI/CD') || content.includes('Docker')) {
      return 'devops';
    }
    return 'general';
  }

  /**
   * Determine whether it is a similar topic
   */
  private isSimilarTopic(content1: string, content2: string): boolean {
    const words1 = new Set(this.extractWords(content1));
    const words2 = new Set(this.extractWords(content2));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size > 0.3; // 30% similarity
  }

  /**
   * Extract words
   */
  private extractWords(text: string): string[] {
    const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    return [...chinese, ...english];
  }

  /**
   * Generate friendly reminders
   */
  private generateReminderMessage(newContent: string, conflicting: Block[]): string {
    if (conflicting.length === 1) {
      const block = conflicting[0];
      const preview = block.content.length > 30
        ? block.content.slice(0, 30) + '...'
        : block.content;

      return `[corivo] 不过你之前说的是："${preview}"`;
    }

    const previews = conflicting.slice(0, 2).map((b) => {
      const preview = b.content.length > 20
        ? b.content.slice(0, 20) + '...'
        : b.content;
      return `"${preview}"`;
    });

    return `[corivo] 你之前说过类似的：${previews.join('、')}`;
  }
}
