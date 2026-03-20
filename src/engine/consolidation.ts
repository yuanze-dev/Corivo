/**
 * 整合引擎
 *
 * 负责合并重复内容、提炼上层知识、补全关联链
 * 模拟人脑在睡眠时整理记忆的过程
 */

import type { Block, CreateBlockInput } from '../models/index.js';
import { generateBlockId } from '../models/block.js';
import { AssociationType, AssociationDirection } from '../models/association.js';

/**
 * 整合结果
 */
export interface ConsolidationResult {
  /** 执行的操作类型 */
  action: 'merged' | 'created_summary' | 'linked';
  /** 涉及的 block ID */
  blocks: string[];
  /** 结果 block（如果有） */
  result?: Block;
  /** 理由说明 */
  reason?: string;
}

/**
 * 整合配置
 */
interface ConsolidationConfig {
  /** 相似度阈值（高于此值认为需要合并） */
  mergeThreshold: number;
  /** 摘要最小关联数量 */
  summaryMinRelated: number;
  /** 自动补链置信度阈值 */
  linkThreshold: number;
}

/**
 * 整合引擎
 */
export class ConsolidationEngine {
  private config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = {
      mergeThreshold: 0.85,
      summaryMinRelated: 3,
      linkThreshold: 0.7,
      ...config,
    };
  }

  /**
   * 去重：合并高度相似的 block
   *
   * @param candidates - 待检查的 block 列表
   * @returns 合并结果列表
   */
  deduplicateBlocks(candidates: Block[]): ConsolidationResult[] {
    const results: ConsolidationResult[] = [];
    const processed = new Set<string>();

    for (const block of candidates) {
      if (processed.has(block.id)) {
        continue;
      }

      // 查找相似 block
      const similar = this.findSimilarBlocks(block, candidates);

      if (similar.length > 0) {
        // 合并到第一个 block
        const merged = this.mergeBlocks(block, similar);
        results.push(merged);

        // 标记为已处理
        processed.add(block.id);
        for (const s of similar) {
          processed.add(s.id);
        }
      }
    }

    return results;
  }

  /**
   * 提炼：为相关 block 创建摘要
   *
   * @param relatedBlocks - 相关的 block 列表
   * @returns 摘要 block 或 null
   */
  createSummary(relatedBlocks: Block[]): Block | null {
    if (relatedBlocks.length < this.config.summaryMinRelated) {
      return null;
    }

    // 检查是否都来自同一领域
    const domains = new Set(
      relatedBlocks.map((b) => this.extractDomain(b.annotation))
    );
    if (domains.size > 1) {
      return null; // 跨领域不创建摘要
    }

    // 提取共同关键词
    const allKeywords = relatedBlocks.flatMap((b) => this.extractKeywords(b.content));
    const keywordFreq = new Map<string, number>();
    for (const kw of allKeywords) {
      keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
    }

    // 出现至少 2 次的关键词
    const commonKeywords = [...keywordFreq.entries()]
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw]) => kw);

    if (commonKeywords.length === 0) {
      return null;
    }

    // 生成摘要内容
    const domain = [...domains][0];
    const summaryContent = this.generateSummaryContent(relatedBlocks, commonKeywords);

    const summaryBlock: Block = {
      id: generateBlockId(),
      content: summaryContent,
      annotation: `知识 · ${domain} · 摘要`,
      refs: relatedBlocks.map((b) => b.id),
      source: 'heartbeat:consolidation',
      vitality: 100,
      status: 'active',
      access_count: 0,
      last_accessed: null,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    };

    return summaryBlock;
  }

  /**
   * 补链：为相关但无 refs 的 block 添加关联
   *
   * @param blocks - block 列表
   * @param associations - 现有关联列表
   * @returns 需要更新的 block ID 映射
   */
  findMissingLinks(
    blocks: Block[],
    associations: Array<{ from_id: string; to_id: string; confidence: number }>
  ): Map<string, string[]> {
    const missingLinks = new Map<string, string[]>();

    // 为每个 block 查找高置信度关联但未在 refs 中的 block
    for (const block of blocks) {
      const currentRefs = new Set(block.refs);

      // 找出高置信度关联但未在 refs 中的目标
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
   * 查找相似 block
   */
  private findSimilarBlocks(target: Block, candidates: Block[]): Block[] {
    const similar: Block[] = [];

    for (const candidate of candidates) {
      if (candidate.id === target.id) {
        continue;
      }

      // 标注必须相同
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
   * 合并 block
   *
   * 保留内容最长、最新的那个作为主 block，其他的记录到 consolidated_from
   */
  private mergeBlocks(primary: Block, duplicates: Block[]): ConsolidationResult {
    // 找出内容最长的作为主 block
    const all = [primary, ...duplicates];
    all.sort((a, b) => b.content.length - a.content.length);

    const main = all[0];
    const others = all.slice(1);

    // 合并 refs（去重）
    const allRefs = new Set<string>();
    allRefs.add(main.id);
    for (const b of all) {
      b.refs.forEach((r) => allRefs.add(r));
    }

    // 计算新的生命力（取最高值）
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
   * 计算两个文本的相似度
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractWords(text1);
    const words2 = this.extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    // Jaccard 相似度
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 生成摘要内容
   */
  private generateSummaryContent(blocks: Block[], keywords: string[]): string {
    const count = blocks.length;
    const latest = blocks.sort((a, b) => b.created_at - a.created_at)[0];

    // 提取各 block 的关键片段
    const snippets = blocks
      .slice(0, 3)
      .map((b) => {
        const snippet = b.content.length > 50
          ? b.content.substring(0, 50) + '...'
          : b.content;
        return snippet;
      });

    return `[${count}条相关记录的摘要]\n\n关键词: ${keywords.join(', ')}\n\n相关内容:\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n最新更新: ${new Date(latest.created_at * 1000).toLocaleDateString('zh-CN')}`;
  }

  /**
   * 提取文本中的关键词
   */
  private extractKeywords(text: string): string[] {
    const words = this.extractWords(text);

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
      .slice(0, 10);
  }

  /**
   * 提取文本中的所有词语
   */
  private extractWords(text: string): string[] {
    const chineseChars = text
      .match(/[\u4e00-\u9fa5]/g)
      ?.filter((c) => !/[，。！？、；：""''（）【】《》]/.test(c)) || [];

    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    return [...chineseChars, ...englishWords];
  }

  /**
   * 从 annotation 中提取领域
   */
  private extractDomain(annotation: string): string {
    const parts = annotation.split(' · ');
    return parts.length >= 2 ? parts[1] : '';
  }
}
