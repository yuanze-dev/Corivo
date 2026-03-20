/**
 * 关联引擎
 *
 * 发现 block 之间的关系，建立知识网络
 * 基于规则的关联发现，零 LLM 依赖
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
 * 关联配置
 */
interface AssociationConfig {
  /** 相似度阈值（高于此值认为是相似内容） */
  similarityThreshold: number;
  /** 关键词匹配权重 */
  keywordWeight: number;
  /** 标注匹配权重 */
  annotationWeight: number;
  /** 时间关联窗口（毫秒，同一时间段内的内容可能相关） */
  timeWindowMs: number;
}

/**
 * 关联引擎
 */
export class AssociationEngine {
  private config: AssociationConfig;

  constructor(config?: Partial<AssociationConfig>) {
    this.config = {
      similarityThreshold: 0.7,
      keywordWeight: 0.6,
      annotationWeight: 0.4,
      timeWindowMs: 3600000, // 1 小时
      ...config,
    };
  }

  /**
   * 基于规则发现关联
   *
   * @param blocks - 待分析的 block 列表
   * @returns 发现的关联列表
   */
  discoverByRules(blocks: Block[]): Association[] {
    const associations: Association[] = [];
    const n = blocks.length;

    // 两两比较，发现关联
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = blocks[i];
        const b = blocks[j];

        // 跳过已归档的
        if (a.status === 'archived' || b.status === 'archived') {
          continue;
        }

        // 检测各种关联类型
        const conflicts = this.detectConflicts(a, b);
        if (conflicts) {
          associations.push(conflicts);
          continue; // 矛盾优先，跳过其他检测
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
   * 检测矛盾关联
   *
   * 主要检测决策类 block 的冲突：
   * - 相同领域（domain）但决策不同
   * - 相同主题但结论相反
   */
  private detectConflicts(a: Block, b: Block): Association | null {
    // 只检测决策类
    if (!a.annotation.includes('决策') || !b.annotation.includes('决策')) {
      return null;
    }

    // 检查领域是否相同
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // 检查是否有模式
    if (!a.pattern || !b.pattern) {
      return null;
    }

    // 相同决策类型但不同选择
    if (a.pattern.type === b.pattern.type && a.pattern.decision !== b.pattern.decision) {
      return {
        id: generateAssociationId(),
        from_id: a.id,
        to_id: b.id,
        type: AssociationType.CONFLICTS,
        direction: AssociationDirection.BI_DIRECTIONAL,
        confidence: 0.8,
        reason: `同一领域的不同决策：${a.pattern.decision} vs ${b.pattern.decision}`,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * 检测替代/更新关联
   *
   * 检测条件：
   * - 相同标注
   * - 后创建的内容提到/修正前创建的内容
   * - 或者后创建的内容是前创建的更完整版本
   */
  private detectSupersedes(a: Block, b: Block): Association | null {
    // 标注必须完全相同
    if (a.annotation !== b.annotation) {
      return null;
    }

    // 确定时间顺序
    const [older, newer] = a.created_at < b.created_at ? [a, b] : [b, a];

    // 检查内容是否提到"修正"、"更新"、"改为"等关键词
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

    // 检查 newer 是否提到 older 的关键内容
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
        reason: '新版本替代旧版本',
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * 检测细化/补充关联
   *
   * 检测条件：
   * - 标注相同领域
   * - 一个内容更短/更抽象，一个内容更长/更具体
   * - 时间接近
   */
  private detectRefines(a: Block, b: Block): Association | null {
    // 领域必须相同
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // 确定哪个更详细
    const [shorter, longer] =
      a.content.length < b.content.length ? [a, b] : [b, a];

    // 长度差异至少 2 倍
    if (longer.content.length < shorter.content.length * 2) {
      return null;
    }

    // 检查时间是否接近
    const timeDiff = Math.abs(longer.created_at - shorter.created_at);
    if (timeDiff > this.config.timeWindowMs) {
      return null;
    }

    // 检查 longer 是否包含 shorter 的关键词
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
        reason: '更详细的版本',
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * 检测相似关联
   *
   * 检测条件：
   * - 标注相同
   * - 内容相似度高于阈值
   */
  private detectSimilar(a: Block, b: Block): Association | null {
    // 标注必须相同
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
        reason: `内容相似度 ${(similarity * 100).toFixed(0)}%`,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * 检测相关关联
   *
   * 检测条件：
   * - 领域相同
   * - 共享关键词
   */
  private detectRelated(a: Block, b: Block): Association | null {
    // 领域必须相同
    const aDomain = this.extractDomain(a.annotation);
    const bDomain = this.extractDomain(b.annotation);

    if (aDomain !== bDomain) {
      return null;
    }

    // 提取关键词并计算重合度
    const aKeywords = this.extractKeywords(a.content);
    const bKeywords = this.extractKeywords(b.content);

    const commonKeywords = aKeywords.filter((kw) =>
      bKeywords.some((bk) => kw.toLowerCase() === bk.toLowerCase())
    );

    // 至少 2 个共同关键词
    if (commonKeywords.length < 2) {
      return null;
    }

    // 计算相关度
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
        confidence: Math.min(jaccard + 0.3, 0.9), // 提升到合理范围
        reason: `共享关键词: ${commonKeywords.slice(0, 3).join(', ')}`,
        context_tags: commonKeywords,
        created_at: Date.now(),
      };
    }

    return null;
  }

  /**
   * 计算两个文本的相似度
   *
   * 使用简化的 Jaccard 相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractWords(text1);
    const words2 = this.extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // 计算 Jaccard 相似度
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 提取文本中的关键词
   *
   * 简单实现：提取中文词汇和英文单词
   */
  private extractKeywords(text: string): string[] {
    const words = this.extractWords(text);

    // 过滤停用词
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
      .slice(0, 10); // 最多返回 10 个
  }

  /**
   * 提取文本中的所有词语
   */
  private extractWords(text: string): string[] {
    // 中文：按字符分割，过滤标点
    const chineseChars = text
      .match(/[\u4e00-\u9fa5]/g)
      ?.filter((c) => !/[，。！？、；：""''（）【】《》]/.test(c)) || [];

    // 英文：提取单词
    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    // 组合
    return [...chineseChars, ...englishWords];
  }

  /**
   * 从 annotation 中提取领域
   *
   * annotation 格式: "性质 · 领域 · 标签"
   */
  private extractDomain(annotation: string): string {
    const parts = annotation.split(' · ');
    return parts.length >= 2 ? parts[1] : '';
  }
}
