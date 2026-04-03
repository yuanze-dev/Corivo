import type { Block, BlockFilter } from '@/domain/memory/models/block.js';
import type { WorkItem } from '../types.js';

type DatabaseBlockRow = Omit<Block, 'created_at' | 'updated_at'> & {
  created_at?: number;
  updated_at?: number;
  freshnessToken?: string;
  metadata?: Record<string, unknown>;
};

export type BlockWorkItem = WorkItem & {
  kind: 'block';
};

export interface DatabaseStaleBlockSourceConfig {
  db: {
    queryBlocks: (filter?: BlockFilter) => Promise<DatabaseBlockRow[]> | DatabaseBlockRow[];
  };
  filter?: BlockFilter;
}

export class DatabaseStaleBlockSource {
  constructor(private readonly config: DatabaseStaleBlockSourceConfig) {}

  async collect(): Promise<BlockWorkItem[]> {
    const rows = await Promise.resolve(this.config.db.queryBlocks(this.config.filter));

    return rows.map((row) => {
      const fallbackFreshness = row.freshnessToken ?? row.updated_at ?? row.created_at;
      const freshnessToken =
        fallbackFreshness !== undefined ? String(fallbackFreshness) : undefined;

      return {
        id: row.id,
        kind: 'block',
        sourceRef: row.source,
        freshnessToken,
        metadata: row.metadata,
      };
    });
  }
}
