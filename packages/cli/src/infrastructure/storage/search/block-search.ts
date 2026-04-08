import { DatabaseError } from '@/domain/errors/index.js';
import { KeyManager } from '@/infrastructure/crypto/keys.js';
import type { Block } from '@/domain/memory/models';

interface SearchRuntime {
  db: {
    prepare(sql: string): any;
  };
  enableEncryption: boolean;
  useSQLCipher: boolean;
  getContentKey: () => Buffer;
  queryBlocks: (filter?: { limit?: number }) => Block[];
  rowToBlock: (row: unknown) => Block;
}

export function searchBlocksWithRuntime(
  runtime: SearchRuntime,
  query: string,
  limit = 10,
): Block[] {
  if (!query || query.trim() === '') {
    return runtime.queryBlocks({ limit });
  }

  if (runtime.enableEncryption && !runtime.useSQLCipher) {
    const allRows = runtime.db.prepare('SELECT * FROM blocks ORDER BY updated_at DESC').all() as unknown[];
    const matched: Block[] = [];
    for (const row of allRows) {
      const block = runtime.rowToBlock(row);
      if (block.content.includes(query) || block.annotation.includes(query)) {
        matched.push(block);
        if (matched.length >= limit) break;
      }
    }
    return matched;
  }

  const ftsStmt = runtime.db.prepare(`
    SELECT b.* FROM blocks b
    INNER JOIN blocks_fts fts ON b.id = fts.id
    WHERE blocks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  try {
    const escapedQuery = query.replace(/["']/g, '');
    const rows = ftsStmt.all(escapedQuery, limit) as unknown[];

    if (rows.length > 0) {
      return rows.map((row) => runtime.rowToBlock(row));
    }
  } catch {
    // Fall through to LIKE backup search.
  }

  const likeStmt = runtime.db.prepare(`
    SELECT * FROM blocks
    WHERE content LIKE ? OR annotation LIKE ?
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  try {
    const likePattern = `%${query}%`;
    const rows = likeStmt.all(likePattern, likePattern, limit) as unknown[];
    return rows.map((row) => runtime.rowToBlock(row));
  } catch (error) {
    throw new DatabaseError('搜索 Blocks 失败', { cause: error });
  }
}
