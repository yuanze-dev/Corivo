/**
 * Push type definitions
 */

/**
 * Context that triggered the push
 */
export enum PushContext {
  SESSION_START = 'session-start',
  POST_REQUEST = 'post-request',
  QUERY = 'query',
  STATUS = 'status',
  SAVE = 'save',
}

/**
 * Push type
 */
export enum PushType {
  SUGGEST = 'suggest',       // Suggest a next step
  CONFLICT = 'conflict',     // Conflict reminder
  DECISION = 'decision',     // Decision experience
  ATTENTION = 'attention',   // Needs attention
  CONTEXT = 'context',       // Related memories
  RELATED = 'related',       // Associated memories
  STATS = 'stats',           // Statistics
  SUMMARY = 'summary',       // Summary
}

/**
 * Push priority
 */
export enum PushPriority {
  SUGGEST = 0,    // P0 - suggestion
  CONFLICT = 1,   // P1 - conflict
  DECISION = 2,   // P2 - decision
  ATTENTION = 3,  // P3 - needs attention
  CONTEXT = 4,    // P4 - context
  STATS = 5,      // P5 - statistics
}

/**
 * A single push item
 */
export interface PushItem {
  type: PushType;
  priority: PushPriority;
  content: string;
  metadata?: {
    blockId?: string;
    confidence?: number;
    reason?: string;
  };
}

/**
 * Push configuration
 */
export interface PushConfig {
  /** Maximum number of items to push */
  maxItems?: number;
  /** Whether to include statistics */
  includeStats?: boolean;
  /** Whether to include suggestions */
  includeSuggest?: boolean;
  /** Whether to include conflict alerts */
  includeConflict?: boolean;
  /** Output format */
  format?: 'text' | 'json';
}

/**
 * Push result
 */
export interface PushResult {
  items: PushItem[];
  total: number;
  truncated: boolean;
}
