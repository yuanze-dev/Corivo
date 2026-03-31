/**
 * Block data model
 *
 * The smallest storage unit in Corivo — a semantically self-contained natural language text fragment.
 */

import type { Pattern } from './pattern';

/**
 * Block lifecycle status
 */
export type BlockStatus = 'active' | 'cooling' | 'cold' | 'archived';

/**
 * Block interface definition
 */
export interface Block {
  /** Unique identifier, format: blk_<hex> */
  id: string;
  /** Natural language body text */
  content: string;
  /** Three-part annotation: nature · domain · tag */
  annotation: string;
  /** IDs of other blocks referenced by this block */
  refs: string[];
  /** Source identifier indicating where this block was collected from */
  source: string;

  /** Vitality score 0-100 */
  vitality: number;
  /** Current lifecycle status */
  status: BlockStatus;
  /** Total number of times this block has been queried or referenced */
  access_count: number;
  /** Timestamp of the most recent access */
  last_accessed: number | null;

  /** Decision pattern (only present on decision-type blocks) */
  pattern?: Pattern;

  /** Creation timestamp */
  created_at: number;
  /** Last updated timestamp */
  updated_at: number;
}

/**
 * Input parameters for creating a Block (id and timestamps are auto-generated)
 */
export type CreateBlockInput = {
  content: string;
  annotation?: string;
  refs?: string[];
  source?: string;
  vitality?: number;
  status?: BlockStatus;
  access_count?: number;
  last_accessed?: number | null;
  pattern?: Pattern;
};

/**
 * Input parameters for updating a Block (all fields are optional)
 *
 * Note: updated_at is only exposed for testing; in production it is always set automatically.
 */
export type UpdateBlockInput = Partial<
  Pick<Block, 'content' | 'annotation' | 'refs' | 'vitality' | 'status' | 'access_count' | 'last_accessed' | 'pattern' | 'updated_at' | 'created_at'>
>;

/**
 * Filter options for querying Blocks
 */
export interface BlockFilter {
  /** Filter by exact annotation match */
  annotation?: string;
  /** Filter by annotation prefix, e.g. "decision" matches all "decision · ..." annotations (exact match takes priority) */
  annotationPrefix?: string;
  /** Filter by lifecycle status */
  status?: BlockStatus;
  /** Minimum vitality threshold */
  minVitality?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Filter by collection source */
  source?: string;
  /** Sort field (default: updated_at) */
  sortBy?: 'updated_at' | 'vitality';
  /** Sort direction (default: DESC) */
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Annotation nature (first dimension)
 */
export const NATURE_TYPES = {
  FACT: '事实',       // passwords, config values, data points, concrete events
  KNOWLEDGE: '知识',  // tutorials, summaries, analyses, methodologies
  DECISION: '决策',   // technology choices, confirmed plans, agreed conventions
  INSTRUCTION: '指令', // user preferences, behavioral rules, automation triggers
} as const;

export type NatureType = (typeof NATURE_TYPES)[keyof typeof NATURE_TYPES];

/**
 * Annotation domain (second dimension)
 */
export const DOMAIN_TYPES = {
  SELF: 'self',         // the user themselves
  PEOPLE: 'people',     // specific individuals
  PROJECT: 'project',   // goal-driven work with a defined endpoint
  AREA: 'area',         // ongoing responsibilities requiring long-term maintenance
  ASSET: 'asset',       // physical items, accounts, or resources
  KNOWLEDGE: 'knowledge', // general knowledge independent of a specific context
  TEAM: 'team',         // added in v0.10: shared team information
} as const;

export type DomainType = (typeof DOMAIN_TYPES)[keyof typeof DOMAIN_TYPES];

/**
 * Validate annotation format
 *
 * @param annotation - The annotation string to validate
 * @returns Whether the annotation is valid
 */
export function validateAnnotation(annotation: string): boolean {
  const parts = annotation.split(' · ');

  // Must contain exactly three parts
  if (parts.length !== 3) {
    return false;
  }

  // First part: validated if it matches a known nature, otherwise allowed for extensibility
  const validNatures = new Set<string>(Object.values(NATURE_TYPES));
  const nature = parts[0];
  // Allow any non-empty first part to support future extension
  if (nature.length === 0) {
    return false;
  }

  // Second part: validated if it matches a known domain, otherwise allowed for extensibility
  const validDomains = new Set<string>(Object.values(DOMAIN_TYPES));
  const domain = parts[1];
  // Allow any non-empty second part to support future extension
  if (domain.length === 0) {
    return false;
  }

  // Third part can be any non-empty tag string
  return parts[2].length > 0;
}

/**
 * Generate a new Block ID
 *
 * @returns A new unique block ID
 */
export function generateBlockId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `blk_${timestamp}${random}`;
}

/**
 * Check whether a block has been annotated (i.e. is not in pending state)
 *
 * @param block - The Block object to check
 * @returns True if the block has a resolved annotation
 */
export function isBlockComplete(block: Block): boolean {
  return block.annotation !== 'pending';
}

/**
 * Calculate the number of days between two timestamps
 *
 * @param earlier - The earlier timestamp (ms)
 * @param later - The later timestamp (ms)
 * @returns Number of days elapsed between the two timestamps
 */
export function daysBetween(earlier: number, later: number): number {
  return (later - earlier) / 86400000;
}

/**
 * Infer the vitality decay rate from a block's annotation
 *
 * @param annotation - The block's annotation string
 * @returns Vitality points to subtract per day
 */
export function inferDecayRate(annotation: string): number {
  const lower = annotation.toLowerCase();

  // Fact-type blocks decay the slowest — they represent stable, long-lived data
  if (lower.startsWith('事实') || lower.includes('asset') || lower.includes('密码')) {
    return 0.5;
  }

  // Knowledge-type blocks decay faster — they become stale as the field evolves
  if (lower.startsWith('知识')) {
    return 2;
  }

  // Default decay rate for all other annotation types
  return 1;
}

/**
 * Derive a BlockStatus from a vitality score
 *
 * @param vitality - Vitality value (0–100)
 * @returns The corresponding BlockStatus
 */
export function vitalityToStatus(vitality: number): BlockStatus {
  if (vitality === 0) return 'archived';
  if (vitality < 30) return 'cold';
  if (vitality < 60) return 'cooling';
  return 'active';
}
