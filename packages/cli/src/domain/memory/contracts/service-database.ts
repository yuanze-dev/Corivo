import type { Association, Block, BlockFilter } from '@/domain/memory/models/index.js';

export interface MemoryServiceDatabase {
  queryBlocks(filter?: BlockFilter): Block[];
  getBlock(id: string): Block | null;
  getBlockAssociations(blockId: string, minConfidence?: number): Association[];
}
