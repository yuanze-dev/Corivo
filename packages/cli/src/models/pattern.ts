/**
 * Pattern data model
 *
 * Represents a structured decision pattern extracted from a decision class block
 */

export interface Pattern {
  /** Decision type: technology selection/communication strategy/time-related */
  type: string;
  /** final decision */
  decision: string;
  /** decision dimension array */
  dimensions: Dimension[];
  /** Denied option */
  alternatives_rejected?: string[];
  /** Applicable context tags */
  context_tags: string[];
  /** Pattern extraction confidence 0-1 */
  confidence: number;
  /** Reasons for decision */
  reason?: string;
  /** Extraction source: rule/llm/mixed */
  _source?: 'rule' | 'llm';
}

export interface Dimension {
  /** Dimension name */
  name: string;
  /** Weight 0-1 */
  weight: number;
  /** Reasoning basis */
  reason: string;
}

/**
 * Validate Pattern objects
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
 * Decision type enum
 */
export const DECISION_TYPES = {
  TECH_CHOICE: '技术选型',
  COMMUNICATION: '沟通策略',
  TIME_BASED: '时间相关',
  ARCHITECTURE: '架构决策',
  PRODUCT: '产品方向',
} as const;

export type DecisionType = (typeof DECISION_TYPES)[keyof typeof DECISION_TYPES];
