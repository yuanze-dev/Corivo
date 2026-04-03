/**
 * Push manager
 *
 * Unified entry point for all Corivo push logic
 */

import type { CorivoDatabase } from '@/storage/database';
import { SuggestionEngine, SuggestionContext } from '@/domain/memory/services/suggestion.js';
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
 * PushManager configuration
 */
export interface PushManagerConfig {
  /** Database instance */
  db: CorivoDatabase;
  /** Deduplication manager (optional, defaults to the global singleton) */
  dedup?: ReturnType<typeof getDedupManager>;
  /** Session ID (optional, used for session-scoped deduplication) */
  sessionId?: string;
}

/**
 * Push manager
 *
 * Unified entry point that generates push content based on the current context
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
   * Generate push items for the given context
   *
   * @param context - The context triggering the push
   * @param options - Additional options
   * @returns Push result containing prioritized items
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

    // Deduplicate to avoid surfacing the same content repeatedly
    const filtered = this.dedupFilter(items);

    // Respect the caller's item cap
    const limited = filtered.slice(0, maxItems);

    return {
      items: limited,
      total: items.length,
      truncated: items.length > maxItems,
    };
  }

  /**
   * Format a push result as a plain-text string
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
   * Format a single push item as a prefixed string
   */
  private formatItem(item: PushItem): string {
    const icon = this.getIcon(item.type);
    return `[corivo] ${icon} ${item.content}`;
  }

  /**
   * Return the emoji icon for a given push type
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
   * Build push items for the SESSION_START context
   */
  private async pushSessionStart(maxItems: number): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. Suggestions carry the highest priority — surface them first
    const suggestion = this.suggestionEngine.generate(SuggestionContext.SESSION_START);
    if (suggestion) {
      items.push({
        type: PushType.SUGGEST,
        priority: PushPriority.SUGGEST,
        content: suggestion.replace('[corivo] ', ''),
      });
    }

    // 2. Blocks that need user attention (cooling or cold status)
    const attention = await this.contextPusher.pushNeedsAttention();
    if (attention) {
      // Parse count from the formatted output string
      const match = attention.match(/\((\d+) 条\)/);
      const count = match ? parseInt(match[1], 10) : 0;
      items.push({
        type: PushType.ATTENTION,
        priority: PushPriority.ATTENTION,
        content: `${count} 条记忆需要关注`,
      });
    }

    // 3. Stats are intentionally omitted here to avoid session-start noise

    return items;
  }

  /**
   * PostRequest push
   */
  private async pushPostRequest(lastMessage?: string, maxItems = 1): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // Check if there is an obvious next step
    const hasObviousNextStep = lastMessage && this.hasObviousNextStep(lastMessage);

    if (!hasObviousNextStep) {
      // Generate suggestions
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
   * Query push
   */
  private async pushQuery(query: string, maxItems = 4): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. Related memories (must recommend)
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

    // 2. Associative memory
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

    // 3. Decision-making experience
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
   * Status push
   */
  private async pushStatus(maxItems = 2): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // 1. Need attention
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
   * Save push (push after saving)
   */
  private async pushSave(maxItems = 1): Promise<PushItem[]> {
    const items: PushItem[] = [];

    // Detect contradictions
    // TODO: Implement conflict detection

    return items;
  }

  /**
   * Determine whether there is an obvious next step
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
   * Deduplication filtering
   */
  private dedupFilter(items: PushItem[]): PushItem[] {
    return items.filter(item => {
      const content = `${item.type}:${item.content}`;
      return this.dedup.shouldPush(content, this.sessionId);
    });
  }

  /**
   * Get the default maximum number of push items
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
