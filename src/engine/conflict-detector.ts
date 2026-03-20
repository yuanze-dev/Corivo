/**
 * 矛盾检测器
 *
 * 检测新保存的内容是否与已有内容矛盾
 * 像朋友一样提醒："不过你之前说的是..."
 */

import type { Block } from '../models/index.js';

/**
 * 矛盾类型
 */
enum ConflictType {
  DECISION_CHANGE = 'decision_change', // 决策变更
  VALUE_CONFLICT = 'value_conflict',   // 价值观冲突
  FACT_CONFLICT = 'fact_conflict',     // 事实冲突
}

/**
 * 矛盾提醒
 */
export interface ConflictReminder {
  hasConflict: boolean;
  message: string;
  conflictingBlocks: Block[];
}

/**
 * 矛盾检测器
 */
export class ConflictDetector {
  /**
   * 检测新内容是否与已有内容矛盾
   *
   * @param newContent - 新保存的内容
   * @param existingBlocks - 已有的 block 列表
   * @returns 矛盾提醒，如果没有矛盾返回 null
   */
  detect(newContent: string, existingBlocks: Block[]): ConflictReminder | null {
    // 只检测决策类内容
    const decisions = existingBlocks.filter((b) =>
      b.annotation.includes('决策') && b.status !== 'archived'
    );

    if (decisions.length === 0) {
      return null;
    }

    const conflicting: Block[] = [];

    // 检测决策变更
    for (const decision of decisions) {
      if (this.isDecisionChange(newContent, decision.content)) {
        conflicting.push(decision);
      }
    }

    if (conflicting.length === 0) {
      return null;
    }

    // 生成友好的提醒语
    const message = this.generateReminderMessage(newContent, conflicting);

    return {
      hasConflict: true,
      message,
      conflictingBlocks: conflicting,
    };
  }

  /**
   * 检测是否是决策变更
   *
   * 规则：之前说"选择 X"，现在说"选择 Y"（X ≠ Y）
   */
  private isDecisionChange(newContent: string, oldContent: string): boolean {
    // 提取决策内容
    const oldDecision = this.extractDecision(oldContent);
    const newDecision = this.extractDecision(newContent);

    if (!oldDecision || !newDecision) {
      return false;
    }

    // 不同领域，不算矛盾
    const oldDomain = this.extractDomain(oldContent);
    const newDomain = this.extractDomain(newContent);

    if (oldDomain !== newDomain) {
      return false;
    }

    // 决策不同，算矛盾
    return oldDecision !== newDecision &&
           this.isSimilarTopic(oldContent, newContent);
  }

  /**
   * 提取决策内容
   */
  private extractDecision(content: string): string | null {
    // 匹配 "选择 X"、"决定 X"、"采用 X"、"使用 X"
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
   * 提取领域
   */
  private extractDomain(content: string): string {
    // 从 annotation 提取，这里简化处理
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
   * 判断是否是相似主题
   */
  private isSimilarTopic(content1: string, content2: string): boolean {
    const words1 = new Set(this.extractWords(content1));
    const words2 = new Set(this.extractWords(content2));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size > 0.3; // 30% 相似度
  }

  /**
   * 提取词语
   */
  private extractWords(text: string): string[] {
    const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    return [...chinese, ...english];
  }

  /**
   * 生成友好的提醒语
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
