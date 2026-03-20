/**
 * 上下文推送模块
 *
 * 在查询时自动推送相关记忆
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block, Association } from '../models/index.js';
import { AssociationType } from '../models/association.js';

/**
 * 推送配置
 */
export interface PushConfig {
  /** 最大显示长度 */
  maxPreviewLength?: number;
  /** 是否显示标注 */
  showAnnotation?: boolean;
  /** 是否显示生命力 */
  showVitality?: boolean;
  /** 是否显示时间 */
  showTime?: boolean;
}

/**
 * 上下文推送器
 */
export class ContextPusher {
  constructor(private db: CorivoDatabase) {}

  /**
   * 查询时附加相关记忆
   *
   * @param query - 查询关键词
   * @param limit - 返回数量限制
   * @param config - 推送配置
   * @returns 格式化的推送文本
   */
  async pushContext(
    query: string,
    limit = 5,
    config: PushConfig = {}
  ): Promise<string> {
    const {
      maxPreviewLength = 80,
      showAnnotation = true,
      showVitality = false,
      showTime = false,
    } = config;

    // 使用 FTS5 搜索相关内容
    const related = this.db.searchBlocks(query, limit);

    if (related.length === 0) {
      return '';
    }

    // 更新访问计数
    // TODO: 优化为批量 UPDATE ... CASE 语句，避免 N+1 问题
    // MVP 阶段记录量小，当前实现可接受
    for (const block of related) {
      this.db.updateBlock(block.id, {
        access_count: block.access_count + 1,
        last_accessed: Date.now(),
      });
    }

    // 格式化输出
    const lines = related.map((block) => this.formatBlock(block, {
      maxPreviewLength,
      showAnnotation,
      showVitality,
      showTime,
    }));

    return `\n\n---\n📚 [corivo] 相关记忆 (${related.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 格式化单个 block
   */
  private formatBlock(
    block: Block,
    config: Required<PushConfig>
  ): string {
    const { maxPreviewLength, showAnnotation, showVitality, showTime } = config;

    // 预览内容
    const preview =
      block.content.length > maxPreviewLength
        ? block.content.slice(0, maxPreviewLength) + '...'
        : block.content;

    // 元信息
    const meta: string[] = [];

    if (showAnnotation && block.annotation && block.annotation !== 'pending') {
      meta.push(`[${block.annotation}]`);
    }

    if (showVitality) {
      const statusIcon = this.getStatusIcon(block.vitality);
      meta.push(`${statusIcon} ${block.vitality}`);
    }

    if (showTime && block.updated_at) {
      const date = new Date(block.updated_at * 1000);
      const daysAgo = Math.floor((Date.now() - block.updated_at * 1000) / 86400000);
      if (daysAgo === 0) {
        meta.push('今天');
      } else if (daysAgo === 1) {
        meta.push('昨天');
      } else if (daysAgo < 30) {
        meta.push(`${daysAgo}天前`);
      } else {
        meta.push(date.toLocaleDateString('zh-CN'));
      }
    }

    const metaStr = meta.length > 0 ? ` ${meta.join(' ')}` : '';

    return `• ${preview}${metaStr}`;
  }

  /**
   * 统计信息推送
   *
   * 使用 SQL GROUP BY 在数据库层面聚合，避免读取全部数据到内存
   */
  async pushStats(): Promise<string> {
    const stats = this.db.getStatusBreakdown();

    return `\n\n---\n📊 [corivo] 记忆统计\n总计: ${stats.total} | 活跃: ${stats.active} | 冷却: ${stats.cooling} | 冷冻: ${stats.cold} | 归档: ${stats.archived}\n`;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(vitality: number): string {
    if (vitality >= 80) return '🟢';
    if (vitality >= 60) return '🟡';
    if (vitality >= 30) return '🟠';
    return '⚫';
  }

  /**
   * 推送需要关注的 block
   *
   * @returns 冷却或冷冻的 block 列表
   */
  async pushNeedsAttention(): Promise<string> {
    const blocks = this.db.queryBlocks({ limit: 100 });

    const needsAttention = blocks.filter(
      (b) => b.status === 'cooling' || b.status === 'cold'
    );

    if (needsAttention.length === 0) {
      return '';
    }

    const lines = needsAttention.map((block) => {
      const preview =
        block.content.length > 60 ? block.content.slice(0, 60) + '...' : block.content;
      return `• ${preview} (${block.annotation}, 生命力: ${block.vitality})`;
    });

    return `\n\n---\n⚠️  [corivo] 需要关注 (${needsAttention.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 推送相关决策模式
   *
   * @param query - 查询关键词
   * @param limit - 返回数量限制
   * @returns 决策模式推送文本
   */
  async pushPatterns(query: string, limit = 3): Promise<string> {
    const related = this.db.searchBlocks(query, limit);

    // 筛选包含 pattern 的 block
    const withPatterns = related.filter((b) => b.pattern && b.annotation.includes('决策'));

    if (withPatterns.length === 0) {
      return '';
    }

    const lines = withPatterns.map((block) => {
      const pattern = block.pattern!;
      const dimensions = pattern.dimensions
        .map((d) => `${d.name}(${Math.round(d.weight * 100)}%)`)
        .join(', ');

      return `• ${pattern.type}: ${pattern.decision}\n  考量: ${dimensions}`;
    });

    return `\n\n---\n💡 [corivo] 相关决策 (${withPatterns.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 基于关联推送相关记忆
   *
   * 不同于 pushContext 的全文搜索，这里基于已建立的关联关系
   *
   * @param query - 查询关键词
   * @param limit - 返回数量限制
   * @returns 关联记忆推送文本
   */
  async pushRelated(query: string, limit = 5): Promise<string> {
    // 先搜索得到初始 block
    const initial = this.db.searchBlocks(query, 3);

    if (initial.length === 0) {
      return '';
    }

    // 获取这些 block 的关联
    const relatedIds = new Set<string>();
    const associations: Association[] = [];

    for (const block of initial) {
      const blockAssocs = this.db.getBlockAssociations(block.id, 0.6);
      associations.push(...blockAssocs);

      for (const assoc of blockAssocs) {
        relatedIds.add(assoc.from_id === block.id ? assoc.to_id : assoc.from_id);
      }
    }

    if (relatedIds.size === 0) {
      return '';
    }

    // 获取关联 block
    const relatedBlocks: Block[] = [];
    for (const id of relatedIds) {
      const block = this.db.getBlock(id);
      if (block && block.status !== 'archived') {
        relatedBlocks.push(block);
      }
    }

    // 按关联置信度排序并限制数量
    relatedBlocks.sort((a, b) => {
      const aAssoc = associations.find(
        (assoc) => assoc.from_id === a.id || assoc.to_id === a.id
      );
      const bAssoc = associations.find(
        (assoc) => assoc.from_id === b.id || assoc.to_id === b.id
      );
      return (bAssoc?.confidence || 0) - (aAssoc?.confidence || 0);
    });

    const limited = relatedBlocks.slice(0, limit);

    if (limited.length === 0) {
      return '';
    }

    // 格式化输出
    const lines = limited.map((block) => {
      const assoc = associations.find(
        (a) => a.from_id === block.id || a.to_id === block.id
      );
      const typeLabel = this.getAssociationTypeLabel(assoc?.type);
      const preview =
        block.content.length > 60 ? block.content.slice(0, 60) + '...' : block.content;

      return `• [${typeLabel}] ${preview}`;
    });

    return `\n\n---\n🔗 [corivo] 关联记忆 (${limited.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 推送矛盾提醒
   *
   * 检测当前内容与已有决策的冲突
   *
   * @param content - 当前内容
   * @returns 矛盾提醒文本
   */
  async pushConflicts(content: string): Promise<string> {
    // 提取当前内容的关键信息
    const keywords = this.extractKeywords(content);

    // 搜索可能冲突的决策
    const conflicts: Array<{ block: Block; reason: string }> = [];

    // 搜索包含决策关键词的 block
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const block of results) {
        if (!block.annotation.includes('决策')) {
          continue;
        }

        // 检查是否已有矛盾关联
        const blockAssocs = this.db.getBlockAssociations(block.id);
        const hasConflict = blockAssocs.some((a) => a.type === AssociationType.CONFLICTS);

        if (hasConflict) {
          // 找到矛盾关联，获取对方
          const conflictAssoc = blockAssocs.find((a) => a.type === AssociationType.CONFLICTS);
          const otherId = conflictAssoc?.from_id === block.id ? conflictAssoc.to_id : conflictAssoc?.from_id;
          const otherBlock = otherId ? this.db.getBlock(otherId) : null;

          if (otherBlock) {
            conflicts.push({
              block: otherBlock,
              reason: `与之前的决策 "${block.content.slice(0, 30)}..." 存在冲突`,
            });
          }
        }
      }
    }

    if (conflicts.length === 0) {
      return '';
    }

    const lines = conflicts.slice(0, 3).map((c) => {
      return `• ${c.reason}\n  "${c.block.content.slice(0, 50)}..."`;
    });

    return `\n\n---\n⚠️  [corivo] 检测到潜在矛盾 (${conflicts.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 推送相关决策（增强版）
   *
   * 结合关联关系的决策推送
   *
   * @param context - 上下文描述
   * @returns 决策建议文本
   */
  async pushDecisions(context: string): Promise<string> {
    const keywords = this.extractKeywords(context);
    const decisions: Array<{ block: Block; relevance: number }> = [];

    // 搜索相关决策
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const block of results) {
        if (!block.annotation.includes('决策') || block.status === 'archived') {
          continue;
        }

        // 检查是否已收集
        if (decisions.some((d) => d.block.id === block.id)) {
          continue;
        }

        // 计算相关性（基于关键词匹配）
        const relevance = this.calculateRelevance(context, block.content);
        if (relevance > 0.3) {
          decisions.push({ block, relevance });
        }
      }
    }

    if (decisions.length === 0) {
      return '';
    }

    // 按相关性排序
    decisions.sort((a, b) => b.relevance - a.relevance);

    const topDecisions = decisions.slice(0, 3);

    const lines = topDecisions.map((d) => {
      const pattern = d.block.pattern;
      const preview = d.block.content.length > 50
        ? d.block.content.slice(0, 50) + '...'
        : d.block.content;

      let line = `• ${preview}`;

      if (pattern) {
        const confidence = Math.round(pattern.confidence * 100);
        line += `\n  置信度: ${confidence}%`;
      }

      return line;
    });

    return `\n\n---\n💡 [corivo] 相关决策经验 (${topDecisions.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * 推送摘要
   *
   * 基于主题推送相关内容的摘要
   *
   * @param topic - 主题关键词
   * @returns 摘要文本
   */
  async pushSummary(topic: string): Promise<string> {
    // 搜索相关 block
    const related = this.db.searchBlocks(topic, 20);

    if (related.length < 3) {
      return ''; // 内容太少，不生成摘要
    }

    // 按标注分组
    const byAnnotation = new Map<string, Block[]>();
    for (const block of related) {
      const key = block.annotation;
      if (!byAnnotation.has(key)) {
        byAnnotation.set(key, []);
      }
      byAnnotation.get(key)!.push(block);
    }

    // 生成摘要
    const lines: string[] = [];

    for (const [annotation, blocks] of byAnnotation.entries()) {
      if (blocks.length >= 2) {
        const domain = annotation.split(' · ')[1] || '通用';
        const preview = blocks
          .slice(0, 2)
          .map((b) => b.content.slice(0, 30) + (b.content.length > 30 ? '...' : ''))
          .join('; ');

        lines.push(`• [${domain}] ${blocks.length}条: ${preview}`);
      }
    }

    if (lines.length === 0) {
      return '';
    }

    return `\n\n---\n📝 [corivo] 主题摘要: ${topic}\n${lines.join('\n')}\n`;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取
    const words = text.toLowerCase().match(/[a-z]{2,}|[\u4e00-\u9fa5]/g) || [];
    const stopWords = new Set([
      '的', '了', '是', '在', '有', '和', '就', '不', '人', '都',
      '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
      '会', '着', '没有', '看', '好', '自己', '这', 'the', 'a', 'an',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
      'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    ]);

    return [...new Set(words)]
      .filter((w) => w.length > 1 && !stopWords.has(w))
      .slice(0, 10);
  }

  /**
   * 计算相关性
   */
  private calculateRelevance(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1));
    const words2 = new Set(this.extractKeywords(text2));

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 获取关联类型标签
   */
  private getAssociationTypeLabel(type?: AssociationType): string {
    if (!type) return '相关';

    const labels: Record<AssociationType, string> = {
      [AssociationType.SIMILAR]: '相似',
      [AssociationType.RELATED]: '相关',
      [AssociationType.CONFLICTS]: '矛盾',
      [AssociationType.REFINES]: '细化',
      [AssociationType.SUPERSEDES]: '更新',
      [AssociationType.CAUSES]: '因果',
      [AssociationType.DEPENDS_ON]: '依赖',
    };

    return labels[type];
  }
}
