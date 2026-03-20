/**
 * Context Suggestion Engine
 *
 * 基于长期记忆预测用户下一步会输入什么
 *
 * 核心哲学（参考 Claude Code v2）：
 * "预测用户会打什么，不是你觉得他们该做什么"
 */

import type { CorivoDatabase } from '../storage/database.js';
import type { Block } from '../models/block.js';

/**
 * 上下文类型
 */
export enum SuggestionContext {
  SESSION_START = 'session-start',
  POST_REQUEST = 'post-request',
}

/**
 * 建议生成配置
 */
export interface SuggestionConfig {
  /** 最大建议数量 */
  maxSuggestions?: number;
  /** 优先考虑的天数范围（天） */
  preferredAgeDays?: [number, number];
  /** 最小生命力 */
  minVitality?: number;
}

/**
 * 建议结果
 */
export interface Suggestion {
  /** 建议内容（不含 [corivo] 前缀） */
  content: string;
  /** 来源 Block ID */
  blockId: string;
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 建议引擎
 */
export class SuggestionEngine {
  private db: CorivoDatabase;
  private config: Required<SuggestionConfig>;

  constructor(db: CorivoDatabase, config: SuggestionConfig = {}) {
    this.db = db;
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 1,
      preferredAgeDays: config.preferredAgeDays ?? [3, 7],
      minVitality: config.minVitality ?? 40,
    };
  }

  /**
   * 生成建议
   *
   * @param context 上下文类型
   * @param lastMessage Claude 最后的回复（用于判断是否应该让出）
   * @returns 建议内容（含 [corivo] 前缀）或空
   */
  generate(context: SuggestionContext, lastMessage?: string): string {
    // 如果是 POST_REQUEST 且 Claude 有明显的下一步，让出
    if (context === SuggestionContext.POST_REQUEST && lastMessage) {
      if (this.hasObviousNextStep(lastMessage)) {
        return ''; // 让 Claude Code 处理
      }
    }

    // 获取候选 Block
    const candidates = this.getCandidateBlocks(context);

    // 调试
    // console.error('candidates:', candidates.length);

    if (candidates.length === 0) {
      return '';
    }

    // 生成建议
    const suggestion = this.buildSuggestion(candidates[0]);

    // 调试
    // console.error('suggestion:', suggestion);

    return suggestion ? `[corivo] ${suggestion}` : '';
  }

  /**
   * 判断 Claude 的回复是否有明显的下一步
   */
  private hasObviousNextStep(message: string): boolean {
    const lower = message.toLowerCase();

    // 明确的完成信号，Claude Code 会处理
    const completionSignals = [
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

    for (const signal of completionSignals) {
      if (new RegExp(signal, 'i').test(lower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取候选 Block
   */
  private getCandidateBlocks(context: SuggestionContext = SuggestionContext.SESSION_START): Block[] {
    const now = Math.floor(Date.now() / 1000);

    // 获取活跃 Block
    const blocks = this.db.queryBlocks({
      limit: 50,
    });

    // 过滤
    return blocks.filter((block) => {
      // 生命力检查
      if (block.vitality < this.config.minVitality) {
        return false;
      }

      // 状态检查（只要 active 和 cooling）
      if (block.status !== 'active' && block.status !== 'cooling') {
        return false;
      }

      // 会话启动：优先最近 24 小时的重要决策
      if (context === SuggestionContext.SESSION_START) {
        const oneDayAgo = now - 86400;
        // 如果是决策类且最近一天内，优先
        if (block.annotation.includes('决策') && block.created_at > oneDayAgo) {
          return true;
        }
        // 否则使用默认范围
      }

      // 默认时间范围检查（不要太新也不要太旧）
      const [minAge, maxAge] = this.config.preferredAgeDays;
      const minTime = now - (maxAge * 86400);
      const maxTime = now - (minAge * 86400);

      if (block.created_at < minTime || block.created_at > maxTime) {
        // 对于会话启动，放宽范围（1-14 天）
        if (context === SuggestionContext.SESSION_START) {
          const sessionMinTime = now - (14 * 86400);
          const sessionMaxTime = now - 86400;
          if (block.created_at < sessionMinTime || block.created_at > sessionMaxTime) {
            return false;
          }
        } else {
          return false;
        }
      }

      // 优先决策类
      if (block.annotation.includes('决策')) {
        return true;
      }

      // 其次是未完成的事实类
      if (block.annotation.includes('事实') && block.refs.length === 0) {
        return true;
      }

      return false;
    }).sort((a, b) => {
      // 按生命力排序
      return b.vitality - a.vitality;
    }).slice(0, this.config.maxSuggestions);
  }

  /**
   * 构建建议内容
   */
  private buildSuggestion(block: Block): string | null {
    const annotation = block.annotation;
    const content = block.content;

    // 解析 annotation
    const parts = annotation.split(' · ');
    const nature = parts[0]; // 性质：决策/事实/知识
    const domain = parts[1]; // 领域：self/people/project/asset/knowledge
    const tag = parts[2];    // 标签

    // 根据类型生成建议
    if (nature === '决策') {
      return this.buildDecisionSuggestion(block, domain, tag);
    }

    if (nature === '事实' && domain === 'people') {
      return this.buildPeopleSuggestion(content);
    }

    // 默认：基于内容生成
    return this.buildGenericSuggestion(content, tag);
  }

  /**
   * 决策类建议
   */
  private buildDecisionSuggestion(block: Block, domain: string, tag: string): string {
    // 如果有 Pattern（技术选型），提取 decision
    if (block.pattern && 'decision' in block.pattern) {
      const decision = (block.pattern as any).decision;
      return `继续 ${decision} 的实施`;
    }

    // 基于 tag 生成
    if (tag) {
      return `继续做 ${tag}`;
    }

    // 基于 content 生成
    const content = block.content.slice(0, 20);
    return `继续 "${content}"`;
  }

  /**
   * 人员相关建议
   */
  private buildPeopleSuggestion(content: string): string {
    // 提取人名或任务
    const match = content.match(/(.{0,15})/);
    const task = match ? match[1].trim() : '事项';
    return `跟进 ${task}`;
  }

  /**
   * 通用建议
   */
  private buildGenericSuggestion(content: string, tag: string): string {
    // 限制内容长度
    const short = content.slice(0, 15);

    if (tag && tag !== '通用' && tag !== '一般') {
      return `检查 ${tag}`;
    }

    return `关于 "${short}" 的进展`;
  }
}

export default SuggestionEngine;
