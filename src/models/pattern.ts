/**
 * Pattern 数据模型
 *
 * 表示从决策类 block 中提取的结构化决策模式
 */

export interface Pattern {
  /** 决策类型：技术选型 / 沟通策略 / 时间相关 */
  type: string;
  /** 最终决定 */
  decision: string;
  /** 决策维度数组 */
  dimensions: Dimension[];
  /** 被拒绝的选项 */
  alternatives_rejected?: string[];
  /** 适用情境标签 */
  context_tags: string[];
  /** 模式提取置信度 0-1 */
  confidence: number;
  /** 提取来源：rule / llm / mixed */
  _source?: 'rule' | 'llm';
}

export interface Dimension {
  /** 维度名称 */
  name: string;
  /** 权重 0-1 */
  weight: number;
  /** 推理依据 */
  reason: string;
}

/**
 * 验证 Pattern 对象
 */
export function validatePattern(pattern: unknown): pattern is Pattern {
  if (typeof pattern !== 'object' || pattern === null) {
    return false;
  }

  const p = pattern as Record<string, unknown>;

  return (
    typeof p.type === 'string' &&
    typeof p.decision === 'string' &&
    Array.isArray(p.dimensions) &&
    typeof p.confidence === 'number' &&
    p.confidence >= 0 &&
    p.confidence <= 1
  );
}

/**
 * 决策类型枚举
 */
export const DECISION_TYPES = {
  TECH_CHOICE: '技术选型',
  COMMUNICATION: '沟通策略',
  TIME_BASED: '时间相关',
  ARCHITECTURE: '架构决策',
  PRODUCT: '产品方向',
} as const;

export type DecisionType = (typeof DECISION_TYPES)[keyof typeof DECISION_TYPES];
