/**
 * Context push module
 *
 * Push relevant memories alongside query results
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block, Association } from '../models/index.js';
import { AssociationType } from '../models/association.js';

/**
 * Push configuration
 */
export interface PushConfig {
  /** Maximum display length */
  maxPreviewLength?: number;
  /** Whether to display labels */
  showAnnotation?: boolean;
  /** Whether to show vitality */
  showVitality?: boolean;
  /** Whether to display time */
  showTime?: boolean;
}

/**
 * Context pusher
 */
export class ContextPusher {
  constructor(private db: CorivoDatabase) {}

  /**
   * Attach related memories when querying
   *
   * @param query - Search query
   * @param limit - Maximum number of results to include
   * @param config - Push configuration
   * @returns Formatted push text
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

    // Search for relevant content using FTS5
    const related = this.db.searchBlocks(query, limit);

    if (related.length === 0) {
      return '';
    }

    // Update access count
    // TODO: Optimize into batch UPDATE...CASE statements to avoid N+1 problem
    // The amount of records in the MVP stage is small and acceptable for the current implementation.
    for (const block of related) {
      this.db.updateBlock(block.id, {
        access_count: block.access_count + 1,
        last_accessed: Date.now(),
      });
    }

    // Format the output payload
    const lines = related.map((block) => this.formatBlock(block, {
      maxPreviewLength,
      showAnnotation,
      showVitality,
      showTime,
    }));

    return `\n\n---\n📚 [corivo] 相关记忆 (${related.length} 条)\n${lines.join('\n')}\n`;
  }

  /**
   * Format a single block
   */
  private formatBlock(
    block: Block,
    config: Required<PushConfig>
  ): string {
    const { maxPreviewLength, showAnnotation, showVitality, showTime } = config;

    // Preview content
    const preview =
      block.content.length > maxPreviewLength
        ? block.content.slice(0, maxPreviewLength) + '...'
        : block.content;

    // Build metadata chips
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
   * Statistics push
   *
   * Use SQL GROUP BY to aggregate at the database level to avoid reading all data into memory
   */
  async pushStats(): Promise<string> {
    const stats = this.db.getStatusBreakdown();

    return `\n\n---\n📊 [corivo] 记忆统计\n总计: ${stats.total} | 活跃: ${stats.active} | 冷却: ${stats.cooling} | 冷冻: ${stats.cold} | 归档: ${stats.archived}\n`;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(vitality: number): string {
    if (vitality >= 80) return '🟢';
    if (vitality >= 60) return '🟡';
    if (vitality >= 30) return '🟠';
    return '⚫';
  }

  /**
   * Push blocks that need attention
   *
   * @returns cooled or frozen block list
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
   * Push relevant decision-making patterns
   *
   * @param query - Search query
   * @param limit - Maximum number of results to include
   * @returns Formatted decision-pattern push text
   */
  async pushPatterns(query: string, limit = 3): Promise<string> {
    const related = this.db.searchBlocks(query, limit);

    // Keep only decision blocks that contain a structured pattern
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
   * Push related memories based on association
   *
   * Different from the full text search of pushContext, this is based on the established association relationship.
   *
   * @param query - Search query
   * @param limit - Maximum number of results to include
   * @returns Formatted related-memory push text
   */
  async pushRelated(query: string, limit = 5): Promise<string> {
    // First search to get the initial block
    const initial = this.db.searchBlocks(query, 3);

    if (initial.length === 0) {
      return '';
    }

    // Get the associations of these blocks
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

    // Load the related blocks
    const relatedBlocks: Block[] = [];
    for (const id of relatedIds) {
      const block = this.db.getBlock(id);
      if (block && block.status !== 'archived') {
        relatedBlocks.push(block);
      }
    }

    // Sort by association confidence and limit quantity
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

    // Format the output payload
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
   * Push conflict reminder
   *
   * Detect conflicts between current content and existing decisions
   *
   * @param content - current content
   * @returns conflict reminder text
   */
  async pushConflicts(content: string): Promise<string> {
    // Extract key information of current content
    const keywords = this.extractKeywords(content);

    // Search for potentially conflicting decisions
    const conflicts: Array<{ block: Block; reason: string }> = [];

    // Search for blocks containing decision keywords
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const block of results) {
        if (!block.annotation.includes('决策')) {
          continue;
        }

        // Check if there are any conflicting relationships
        const blockAssocs = this.db.getBlockAssociations(block.id);
        const hasConflict = blockAssocs.some((a) => a.type === AssociationType.CONFLICTS);

        if (hasConflict) {
          // Find the contradictory relationship and get the other party
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
   * Push related decisions (enhanced version)
   *
   * Decision push based on correlation
   *
   * @param context - context description
   * @returns Decision suggestion text
   */
  async pushDecisions(context: string): Promise<string> {
    const keywords = this.extractKeywords(context);
    const decisions: Array<{ block: Block; relevance: number }> = [];

    // Search related decisions
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const block of results) {
        if (!block.annotation.includes('决策') || block.status === 'archived') {
          continue;
        }

        // Check if collected
        if (decisions.some((d) => d.block.id === block.id)) {
          continue;
        }

        // Calculate relevance (based on keyword matching)
        const relevance = this.calculateRelevance(context, block.content);
        if (relevance > 0.3) {
          decisions.push({ block, relevance });
        }
      }
    }

    if (decisions.length === 0) {
      return '';
    }

    // Sort by relevance
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
   * Push summary
   *
   * Push summary of relevant content based on topic
   *
   * @param topic - topic keyword
   * @returns summary text
   */
  async pushSummary(topic: string): Promise<string> {
    // Search related blocks
    const related = this.db.searchBlocks(topic, 20);

    if (related.length < 3) {
      return ''; // Too little content, no summary generated
    }

    // Group by label
    const byAnnotation = new Map<string, Block[]>();
    for (const block of related) {
      const key = block.annotation;
      if (!byAnnotation.has(key)) {
        byAnnotation.set(key, []);
      }
      byAnnotation.get(key)!.push(block);
    }

    // Generate summary
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
   * Extract keywords
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
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
   * Calculate correlation
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
   * Get association type label
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
