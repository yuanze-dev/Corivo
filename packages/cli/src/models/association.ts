/**
 * Association data model
 *
 * Relationships between blocks, which form the basis of the knowledge graph
 */

/**
 * Association type
 */
export enum AssociationType {
  /** Similar content (may repeat or describe the same thing) */
  SIMILAR = 'similar',
  /** Thematically related (different aspects of the same field) */
  RELATED = 'related',
  /** Conflict in content (conflict in decision-making, inconsistent statements) */
  CONFLICTS = 'conflicts',
  /** Refinements/Supplements (more detailed version) */
  REFINES = 'refines',
  /** Replacement/update (new version replaces old version) */
  SUPERSEDES = 'supersedes',
  /** Causal relationship (A causes B) */
  CAUSES = 'causes',
  /** Dependency (A depends on B) */
  DEPENDS_ON = 'depends_on',
}

/**
 * Association direction
 */
export enum AssociationDirection {
  /** One-way: from → to */
  ONE_WAY = 'one_way',
  /** Bidirectional: from ↔ to */
  BI_DIRECTIONAL = 'bi_directional',
}

/**
 * Association model
 */
export interface Association {
  /** Unique identifier, format: asso_<hex> */
  id: string;
  /** Source block ID */
  from_id: string;
  /** Target block ID */
  to_id: string;
  /** Association type */
  type: AssociationType;
  /** Association direction */
  direction: AssociationDirection;
  /** Confidence 0-1 */
  confidence: number;
  /** Association description (optional, such as an LLM-generated explanation) */
  reason?: string;
  /** Creation timestamp */
  created_at: number;
  /** Associated contextual labels (for inference) */
  context_tags?: string[];
}

/**
 * Association creation parameters
 */
export type CreateAssociationInput = {
  from_id: string;
  to_id: string;
  type: AssociationType;
  direction?: AssociationDirection;
  confidence: number;
  reason?: string;
  context_tags?: string[];
};

/**
 * Association query filters
 */
export interface AssociationFilter {
  /** Filter by from_id */
  from_id?: string;
  /** Filter by to_id */
  to_id?: string;
  /** Filter by type */
  type?: AssociationType;
  /** Minimum confidence */
  minConfidence?: number;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Association statistics
 */
export interface AssociationStats {
  /** Total number of associations */
  total: number;
  /** Statistics grouped by type */
  byType: Record<AssociationType, number>;
  /** Average confidence */
  avgConfidence: number;
  /** Most connected blocks */
  mostConnected: Array<{ block_id: string; count: number }>;
}

/**
 * Generate association ID
 */
export function generateAssociationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `asso_${timestamp}${random}`;
}

/**
 * Determine whether the association type requires bidirectional processing
 */
export function isBiDirectionalType(type: AssociationType): boolean {
  return type === AssociationType.RELATED || type === AssociationType.SIMILAR;
}

/**
 * Get the Chinese description of the associated type
 */
export function getAssociationTypeLabel(type: AssociationType): string {
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
