import { DatabaseError } from '@/domain/errors/index.js';
import { KeyManager } from '@/infrastructure/crypto/keys.js';
import type {
  Block,
  BlockFilter,
  CreateBlockInput,
  UpdateBlockInput,
} from '@/domain/memory/models';
import { generateBlockId } from '@/domain/memory/models/block.js';

interface BlockSqliteDb {
  prepare(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

interface BlockRepositoryRuntime {
  db: BlockSqliteDb;
  enableEncryption: boolean;
  useSQLCipher: boolean;
  getContentKey: () => Buffer;
  rowToBlock: (row: unknown) => Block;
}

export class BlockRepository {
  constructor(private readonly runtime: BlockRepositoryRuntime) {}

  create(input: CreateBlockInput): Block {
    this.validateCreateInput(input);

    const id = generateBlockId();
    const now = Math.floor(Date.now() / 1000);
    const contentToStore = this.encryptContent(input.content);

    const stmt = this.runtime.db.prepare(`
      INSERT INTO blocks (
        id, content, annotation, refs, source, vitality, status,
        access_count, last_accessed, pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        contentToStore,
        input.annotation || 'pending',
        JSON.stringify(input.refs || []),
        input.source || 'manual',
        input.vitality ?? 100,
        input.status ?? 'active',
        input.access_count ?? 0,
        input.last_accessed ?? null,
        input.pattern ? JSON.stringify(input.pattern) : null,
        now,
        now,
      );
    } catch (error) {
      throw new DatabaseError('创建 Block 失败', { cause: error, blockId: id });
    }

    return {
      id,
      content: input.content,
      annotation: input.annotation || 'pending',
      refs: input.refs || [],
      source: input.source || 'manual',
      vitality: input.vitality ?? 100,
      status: input.status ?? 'active',
      access_count: input.access_count ?? 0,
      last_accessed: input.last_accessed ?? null,
      pattern: input.pattern,
      created_at: now,
      updated_at: now,
    } as Block;
  }

  upsert(input: CreateBlockInput & { id: string }): Block {
    if (!input.id || input.id.trim().length === 0) {
      throw new DatabaseError('Block ID 不能为空');
    }
    this.validateContent(input.content);

    const existing = this.getById(input.id);
    const now = Math.floor(Date.now() / 1000);
    const contentToStore = this.encryptContent(input.content);

    const merged: Block = {
      id: input.id,
      content: input.content,
      annotation: input.annotation ?? existing?.annotation ?? 'pending',
      refs: input.refs ?? existing?.refs ?? [],
      source: input.source ?? existing?.source ?? 'sync',
      vitality: input.vitality ?? existing?.vitality ?? 100,
      status: input.status ?? existing?.status ?? 'active',
      access_count: input.access_count ?? existing?.access_count ?? 0,
      last_accessed: input.last_accessed ?? existing?.last_accessed ?? null,
      pattern: input.pattern ?? existing?.pattern,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    const stmt = this.runtime.db.prepare(`
      INSERT INTO blocks (
        id, content, annotation, refs, source, vitality, status,
        access_count, last_accessed, pattern, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        annotation = excluded.annotation,
        refs = excluded.refs,
        source = excluded.source,
        vitality = excluded.vitality,
        status = excluded.status,
        access_count = excluded.access_count,
        last_accessed = excluded.last_accessed,
        pattern = excluded.pattern,
        updated_at = excluded.updated_at
    `);

    try {
      stmt.run(
        merged.id,
        contentToStore,
        merged.annotation,
        JSON.stringify(merged.refs),
        merged.source,
        merged.vitality,
        merged.status,
        merged.access_count,
        merged.last_accessed,
        merged.pattern ? JSON.stringify(merged.pattern) : null,
        merged.created_at,
        merged.updated_at,
      );
    } catch (error) {
      throw new DatabaseError('导入 Block 失败', { cause: error, blockId: input.id });
    }

    return merged;
  }

  getById(id: string): Block | null {
    const row = this.runtime.db.prepare('SELECT * FROM blocks WHERE id = ?').get(id);
    return row ? this.runtime.rowToBlock(row) : null;
  }

  update(id: string, updates: UpdateBlockInput): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(this.encryptContent(updates.content));
    }
    if (updates.annotation !== undefined) {
      fields.push('annotation = ?');
      values.push(updates.annotation);
    }
    if (updates.refs !== undefined) {
      fields.push('refs = ?');
      values.push(JSON.stringify(updates.refs));
    }
    if (updates.vitality !== undefined) {
      fields.push('vitality = ?');
      values.push(updates.vitality);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.access_count !== undefined) {
      fields.push('access_count = ?');
      values.push(updates.access_count);
    }
    if (updates.last_accessed !== undefined) {
      fields.push('last_accessed = ?');
      values.push(updates.last_accessed);
    }
    if (updates.pattern !== undefined) {
      fields.push('pattern = ?');
      values.push(updates.pattern ? JSON.stringify(updates.pattern) : null);
    }
    if (updates.updated_at !== undefined) {
      fields.push('updated_at = ?');
      values.push(updates.updated_at);
    } else {
      fields.push('updated_at = ?');
      values.push(Math.floor(Date.now() / 1000));
    }
    if (updates.created_at !== undefined) {
      fields.push('created_at = ?');
      values.push(updates.created_at);
    }
    values.push(id);

    const stmt = this.runtime.db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`);

    try {
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('更新 Block 失败', { cause: error, blockId: id });
    }
  }

  batchUpdateVitality(updates: Array<{ id: string; vitality: number; status: string }>): number {
    if (updates.length === 0) return 0;

    const now = Math.floor(Date.now() / 1000);
    let updatedCount = 0;
    const transaction = this.runtime.db.transaction(() => {
      const stmt = this.runtime.db.prepare(`
        UPDATE blocks
        SET vitality = ?, status = ?, updated_at = ?
        WHERE id = ?
      `);

      for (const update of updates) {
        try {
          const result = stmt.run(update.vitality, update.status, now, update.id);
          updatedCount += result.changes;
        } catch (error) {
          console.error(`批量更新失败 ${update.id}:`, error);
        }
      }
    });

    try {
      transaction();
      return updatedCount;
    } catch (error) {
      throw new DatabaseError('批量更新 Block 失败', { cause: error });
    }
  }

  delete(id: string): boolean {
    const stmt = this.runtime.db.prepare('DELETE FROM blocks WHERE id = ?');

    try {
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('删除 Block 失败', { cause: error, blockId: id });
    }
  }

  query(filter: BlockFilter = {}): Block[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.annotation) {
      conditions.push('annotation = ?');
      values.push(filter.annotation);
    } else if (filter.annotationPrefix) {
      const escaped = filter.annotationPrefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
      conditions.push("annotation LIKE ? ESCAPE '\\'");
      values.push(`${escaped}%`);
    }
    if (filter.status) {
      conditions.push('status = ?');
      values.push(filter.status);
    }
    if (filter.minVitality !== undefined) {
      conditions.push('vitality >= ?');
      values.push(filter.minVitality);
    }
    if (filter.source) {
      conditions.push('source = ?');
      values.push(filter.source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const sortColumn = filter.sortBy === 'vitality' ? 'vitality' : 'updated_at';
    const sortDirection = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const stmt = this.runtime.db.prepare(`
      SELECT * FROM blocks ${whereClause} ORDER BY ${sortColumn} ${sortDirection} ${limitClause}
    `);

    try {
      const rows = stmt.all(...values) as unknown[];
      return rows.map((row) => this.runtime.rowToBlock(row));
    } catch (error) {
      throw new DatabaseError('查询 Blocks 失败', { cause: error });
    }
  }

  private validateCreateInput(input: CreateBlockInput): void {
    this.validateContent(input.content);

    if (input.refs !== undefined) {
      if (!Array.isArray(input.refs)) {
        throw new DatabaseError('refs 必须是数组');
      }
      for (const ref of input.refs) {
        if (typeof ref !== 'string') {
          throw new DatabaseError('refs 中的每个元素必须是字符串');
        }
      }
    }

    if (input.pattern !== undefined) {
      const pattern = input.pattern;
      if (typeof pattern !== 'object' || pattern === null) {
        throw new DatabaseError('pattern 必须是对象');
      }
      if (typeof pattern.type !== 'string') {
        throw new DatabaseError('pattern.type 必须是字符串');
      }
      if (typeof pattern.decision !== 'string') {
        throw new DatabaseError('pattern.decision 必须是字符串');
      }
      if (!Array.isArray(pattern.dimensions)) {
        throw new DatabaseError('pattern.dimensions 必须是数组');
      }
      if (!Array.isArray(pattern.context_tags)) {
        throw new DatabaseError('pattern.context_tags 必须是数组');
      }
      if (typeof pattern.confidence !== 'number') {
        throw new DatabaseError('pattern.confidence 必须是数字');
      }
    }
  }

  private validateContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new DatabaseError('Block 内容不能为空');
    }
    if (content.length > 1024 * 1024) {
      throw new DatabaseError('Block 内容超出最大长度限制 (1MB)');
    }
  }

  private encryptContent(content: string): string {
    return (this.runtime.enableEncryption && !this.runtime.useSQLCipher)
      ? KeyManager.encryptContent(content, this.runtime.getContentKey())
      : content;
  }
}
