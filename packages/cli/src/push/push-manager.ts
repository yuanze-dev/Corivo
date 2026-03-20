/**
 * 推送管理器
 *
 * 统一 Corivo 的所有推送逻辑
 */

import type { CorivoDatabase } from '../storage/database.js';
import { SuggestionEngine, SuggestionContext } from '../engine/suggestion.js';
import { ContextPusher } from './context.js';
import {
  PushContext,
  PushType,
  PushPriority,
  PushItem,
  PushConfig,
  PushResult,
} from './push-types.js';
import { getDedupManager } from './dedup.js';

/**
 * 推送管理器配置
 */
export interface PushManagerConfig {
  /** 数据库实例 */
  db: CorivoDatabase;
  /** 去重管理器（可选，默认使用全局单例） */
  dedup?: ReturnType<typeof getDedupManager>;
  /** 会话 ID（可选，用于去重） */
  sessionId?: string;
}

/**
 * 推送管理器
 *
 * 统一入口，根据上下文生成推送内容
 */
export class PushManager {
  private db: CorivoDatabase;
  private dedup: ReturnType<typeof getDedupManager>;
  private sessionId?: string;
  private suggestionEngine: SuggestionEngine;
  private contextPusher: ContextPusher;

  constructor(config: PushManagerConfig) {
    this.db = config.db;
    this.dedup = config.dedup || getDedupManager();
    this.sessionId = config.sessionId;
    this.suggestionEngine = new SuggestionEngine(this.db);
    this.contextPusher = new ContextPusher(this.db);
  }

  /**
   * 生成推送
   *
   * @param context 推送上下文
   * @param options 额外选项
   * @returns 推送结果
   */
  async push(
    context: PushContext,
    options: {
      lastMessage?: string;
      query?: string;
      maxItems?: number;
    } = {}
  ): Promise<PushResult> {
    const maxItems = options.maxItems ?? this.getDefaultMaxItems(context);
    const items: PushItem[] = [];

    switch (context) {
      case PushContext.SESSION_START:
        items.push(...await this.pushSessionStart(maxItems));
        break;

      case PushContext.POST_REQUEST:
        items.push(...await this.pushPostRequest(options.lastMessage, maxItems));
        break;

      case PushContext.QUERY:
        if (!options.query) {
          return { items: [], total: 0, truncated: false };
        }
        items.push(...await this.pushQuery(options.query, maxItems));
        break;

      case PushContext.STATUS:
        items.push(...await this.pushStatus(maxItems));
        break;

      case PushContext.SAVE:
        items.push(...await this.pushSave(maxItems));
        break;
    }

    // 去重
    const filtered = this.dedupFilter(items);

    // 限制数量
    const limited = filtered.slice(0, maxItems);

    return {
      items: limited,
      total: items.length,
      truncated: items.length > maxItems,
    };
  }

  /**
   * 格式化推送结果为文本
   */
  format(result: PushResult): string {
    if (result.items.length === 0) {
      return '';
    }

    const lines: string[] = [];

    for (const item of result.items) {
      lines.push(this.formatItem(item));
    }

    return '\n' + lines.join('\n') + '\n';
  }

  /**
   * 格式化单个推送项
   */
  private formatItem(item: PushItem): string {
    const icon = this.getIcon(item.type);
    return `[corivo] ${icon} ${item.content}`;
  }

  /**
   * 获取推送类型图标
   */
  private getIcon(type: PushType): string {
    const icons: Record<PushType, string> = {
      [PushType.SUGGEST]: '🌱',
      [PushType.CONFLICT]: '⚡',
      [PushType.DECISION]: '💡',
      [PushType.ATTENTION]: '⚠️',
      [PushType.CONTEXT]: '📚',
      [PushType.RELATED]: '🔗',
      [PushType.STATS]: '📊',
      [PushType.SUMMARY]: '📝',
    };
    return icons[type];
  }

  /**
   * SessionStart 推送
   */
  private async pushSessionStart(maxItems: number): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. 建议（最高优先级）
    const suggestion = this.suggestionEngine.generate(SuggestionContext.SESSION_START);
    if (suggestion) {
      items.push({
        type: PushType.SUGGEST,
        priority: PushPriority.SUGGEST,
        content: suggestion.replace('[corivo] ', ''),
      });
    }

    // 2. 需要关注
    const attention = await this.contextPusher.pushNeedsAttention();
    if (attention) {
      // 解析数量
      const match = attention.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.ATTENTION,
        priority: PushPriority.ATTENTION,
        content: `${count} 条记忆需要关注`,
      });
    }

    // 3. 统计（仅在第一次或数量变化大时）
    // 暂时不推送统计，避免过于频繁

    return items;
  }

  /**
   * PostRequest 推送
   */
  private async pushPostRequest(lastMessage?: string, maxItems = 1): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 检查是否有明显的下一步
    const hasObviousNextStep = lastMessage && this.hasObviousNextStep(lastMessage);

    if (!hasObviousNextStep) {
      // 生成建议
      const suggestion = this.suggestionEngine.generate(
        SuggestionContext.POST_REQUEST,
        lastMessage
      );
      if (suggestion) {
        items.push({
          type: PushType.SUGGEST,
          priority: PushPriority.SUGGEST,
          content: suggestion.replace('[corivo] ', ''),
        });
      }
    }

    return items;
  }

  /**
   * Query 推送
   */
  private async pushQuery(query: string, maxItems = 4): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. 相关记忆（必推）
    const contextText = await this.contextPusher.pushContext(query, 5);
    if (contextText) {
      const match = contextText.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.CONTEXT,
        priority: PushPriority.CONTEXT,
        content: `相关记忆 ${count} 条`,
      });
    }

    // 2. 关联记忆
    const relatedText = await this.contextPusher.pushRelated(query, 3);
    if (relatedText) {
      const match = relatedText.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.RELATED,
        priority: PushPriority.CONTEXT,
        content: `关联记忆 ${count} 条`,
      });
    }

    // 3. 决策经验
    const decisionText = await this.contextPusher.pushDecisions(query);
    if (decisionText) {
      const match = decisionText.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.DECISION,
        priority: PushPriority.DECISION,
        content: `相关决策 ${count} 条`,
      });
    }

    return items;
  }

  /**
   * Status 推送
   */
  private async pushStatus(maxItems = 2): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. 需要关注
    const attention = await this.contextPusher.pushNeedsAttention();
    if (attention) {
      const match = attention.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.ATTENTION,
        priority: PushPriority.ATTENTION,
        content: `${count} 条记忆需要关注`,
      });
    }

    return items;
  }

  /**
   * Save 推送（保存后的推送）
   */
  private async pushSave(maxItems = 1): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 检测矛盾
    // TODO: 实现 conflict 检测

    return items;
  }

  /**
   * 判断是否有明显的下一步
   */
  private hasObviousNextStep(message: string): boolean {
    const lower = message.toLowerCase();

    const signals = [
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

    for (const signal of signals) {
      if (new RegExp(signal, 'i').test(lower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 去重过滤
   */
  private dedupFilter(items: PushItem[]): PushItem[] {
    return items.filter(item => {
      const content = `${item.type}:${item.content}`;
      return this.dedup.shouldPush(content, this.sessionId);
    });
  }

  /**
   * 获取默认最大推送数量
   */
  private getDefaultMaxItems(context: PushContext): number {
    const defaults: Record<PushContext, number> = {
      [PushContext.SESSION_START]: 3,
      [PushContext.POST_REQUEST]: 1,
      [PushContext.QUERY]: 4,
      [PushContext.STATUS]: 2,
      [PushContext.SAVE]: 1,
    };
    return defaults[context];
  }
}

export default PushManager;
