/**
 * 触发决策引擎
 *
 * 让 Corivo 自己判断什么时候需要告诉用户什么
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/block.js';
import { AssociationType } from '../models/association.js';

/**
 * 触发决策输入
 */
export interface TriggerInput {
  /** 当前时间戳 */
  now: number;
  /** 最近保存的 block */
  recentBlock?: Block;
  /** 当前对话上下文（如果有） */
  conversationContext?: string;
  /** 上次检查时间 */
  lastCheckTime?: number;
}

/**
 * 推送项
 */
export interface PushItem {
  id: string;
  type: 'conflict' | 'forgotten' | 'relevant' | 'attention' | 'summary';
  priority: number; // 0-4, 越小越重要
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: number;
  expires_at: number;
  dismissed: boolean;
}

/**
 * 触发决策引擎
 */
export class TriggerDecision {
  private db: CorivoDatabase;
  private readonly DECISION_DAYS = 3; // 决策 N 天后提醒
  private readonly FORGOTTEN_THRESHOLD = 7; // N 天未访问算遗忘
  private readonly CONFLICT_COOLDOWN = 86400 * 7; // 同一矛盾 7 天不重复

  constructor(db: CorivoDatabase) {
    this.db = db;
  }

  /**
   * 决策是否需要推送
   *
   * @param input 触发输入
   * @returns 推送项列表（最多 2 条）
   */
  decide(input: TriggerInput): PushItem[] {
    const items: PushItem[] = [];

    // 1. 冲突检测（最高优先级）
    if (input.recentBlock) {
      const conflict = this.checkConflict(input.recentBlock);
      if (conflict) {
        items.push(conflict);
      }
    }

    // 2. 遗忘的决策（重要但不紧急）
    if (!input.recentBlock || !input.recentBlock.annotation.includes('决策')) {
      // 如果刚保存的不是决策，检查是否有遗忘的决策
      const forgotten = this.checkForgotten(input.now);
      if (forgotten) {
        items.push(forgotten);
      }
    }

    // 3. 需要关注的记忆（冷却期）
    const attention = this.checkAttention();
    if (attention.length > 0 && items.length < 2) {
      items.push(...attention.slice(0, 2 - items.length));
    }

    // 克制：最多返回 2 条
    return items.slice(0, 2);
  }

  /**
   * 检查冲突
   */
  private checkConflict(block: Block): PushItem | null {
    // 只检查决策类
    if (!block.annotation.includes('决策')) {
      return null;
    }

    // 提取关键词
    const keywords = this.extractKeywords(block.content);

    // 搜索可能冲突的决策
    for (const keyword of keywords.slice(0, 5)) {
      const results = this.db.searchBlocks(keyword, 5);

      for (const existing of results) {
        // 跳过自己
        if (existing.id === block.id) {
          continue;
        }

        // 只检查决策类
        if (!existing.annotation.includes('决策')) {
          continue;
        }

        // 检查是否已有关联
        const assocs = this.db.getBlockAssociations(block.id);
        const hasConflict = assocs.some(a => a.type === AssociationType.CONFLICTS);

        if (hasConflict) {
          // 找到矛盾关联
          const conflictAssoc = assocs.find(a => a.type === AssociationType.CONFLICTS);
          const otherId = conflictAssoc?.from_id === block.id
            ? conflictAssoc.to_id
            : conflictAssoc?.from_id;

          if (otherId) {
            const otherBlock = this.db.getBlock(otherId);
            if (otherBlock) {
              return {
                id: `push_${Date.now()}_conflict`,
                type: 'conflict',
                priority: 0,
                title: '与之前的决策矛盾',
                message: `之前：${existing.content.slice(0, 50)}...\n现在：${block.content.slice(0, 50)}...`,
                metadata: {
                  blockId: block.id,
                  conflictWith: otherBlock.id,
                },
                created_at: Math.floor(Date.now() / 1000),
                expires_at: Math.floor(Date.now() / 1000) + 86400, // 1 天后过期
                dismissed: false,
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 检查遗忘的决策
   */
  private checkForgotten(now: number): PushItem | null {
    const nowSec = Math.floor(now / 1000);
    const threshold = nowSec - (this.DECISION_DAYS * 86400);

    // 获取决策类 block
    const blocks = this.db.queryBlocks({ limit: 50 });

    // 找到 3-N 天前创建、未完成的决策
    const candidates = blocks.filter(block => {
      if (!block.annotation.includes('决策')) {
        return false;
      }

      // 时间范围：3-7 天前
      if (block.created_at < threshold - (4 * 86400)) {
        return false; // 太旧了
      }
      if (block.created_at > threshold) {
        return false; // 太新了
      }

      // 检查是否"遗忘"（最近没有访问）
      const lastAccessed = block.last_accessed || (block.updated_at * 1000);
      const daysSinceAccess = (now - lastAccessed) / 86400000;

      return daysSinceAccess > this.FORGOTTEN_THRESHOLD;
    });

    if (candidates.length === 0) {
      return null;
    }

    // 选择生命力最高但被遗忘的
    const best = candidates.sort((a, b) => b.vitality - a.vitality)[0];

    return {
      id: `push_${Date.now()}_forgotten`,
      type: 'forgotten',
      priority: 1,
      title: `考虑一下 ${this.extractDecision(best)}`,
      message: best.content.slice(0, 100),
      metadata: {
        blockId: best.id,
        daysSinceAccess: Math.floor((now - (best.last_accessed || best.updated_at * 1000)) / 86400000),
      },
      created_at: nowSec,
      expires_at: nowSec + 86400 * 3, // 3 天后过期
      dismissed: false,
    };
  }

  /**
   * 检查需要关注的记忆
   */
  private checkAttention(): PushItem[] {
    const blocks = this.db.queryBlocks({ limit: 100 });

    // 找到冷却/冷冻的重要记忆
    const needsAttention = blocks.filter(block => {
      if (block.status !== 'cooling' && block.status !== 'cold') {
        return false;
      }

      // 优先决策类
      if (block.annotation.includes('决策')) {
        return true;
      }

      // 其次是高生命力的事实
      if (block.annotation.includes('事实') && block.vitality > 30) {
        return true;
      }

      return false;
    }).slice(0, 5);

    if (needsAttention.length === 0) {
      return [];
    }

    return needsAttention.map(block => ({
      id: `push_${Date.now()}_${block.id}`,
      type: 'attention' as const,
      priority: 3,
      title: '记忆需要关注',
      message: `${block.annotation} (生命力: ${block.vitality})`,
      metadata: {
        blockId: block.id,
        status: block.status,
        vitality: block.vitality,
      },
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      dismissed: false,
    }));
  }

  /**
   * 提取决策关键词
   */
  private extractKeywords(content: string): string[] {
    const words = content.toLowerCase().match(/[a-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * 提取决策内容
   */
  private extractDecision(block: Block): string {
    if (block.pattern && 'decision' in block.pattern) {
      return (block.pattern as { decision: string }).decision;
    }

    // 从 annotation 中提取 tag
    const parts = block.annotation.split(' · ');
    if (parts.length >= 3) {
      return parts[2]; // tag
    }

    return block.content.slice(0, 20);
  }
}

export default TriggerDecision;
