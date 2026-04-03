/**
 * Database storage layer
 *
 * Provides encrypted local storage using SQLCipher, supports WAL mode and connection pooling
 *
 * ## Encryption support
 *
 * To enable SQLCipher encryption, you need to link the SQLCipher library when building better-sqlite3:
 *
 * ```bash
 * # Uninstall the normal version
 * npm uninstall better-sqlite3
 *
 * #Install build dependencies
 * npm install --save-dev node-gyp
 *
 * # Install SQLCipher (macOS)
 * brew install sqlcipher
 *
 * # Set environment variables and reinstall
 * export SQLITE3_LIB_DIR=$(brew --prefix sqlcipher)/lib
 * export SQLITE3_INCLUDE_DIR=$(brew --prefix sqlcipher)/include
 * npm install better-sqlite3 --build-from-source
 * ```
 *
 * If not built with SQLCipher, pragma key statements are silently ignored.
 * The database will be stored in clear text (users should rely on file system encryption such as FileVault).
 */

// ESM Compatible: Use createRequire to load CommonJS modules
import { createRequire } from 'node:module';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { DatabaseError } from '../errors/index.js';
import type { SessionMessage, SessionRecord } from '../memory-pipeline/contracts/session-record.js';
import type {
  SessionRecordQuery,
} from '../memory-pipeline/sources/session-record-source.js';
import type {
  Block,
  CreateBlockInput,
  UpdateBlockInput,
  BlockFilter,
  Association,
  CreateAssociationInput,
  AssociationFilter,
  AssociationStats,
} from '../models/index.js';
import { generateBlockId } from '../models/block.js';
import { generateAssociationId, AssociationType } from '../models/association.js';
import { KeyManager } from '../crypto/keys.js';
import { randomUUID } from 'node:crypto';
import type { HostId } from '@/domain/host/contracts/types.js';
import {
  getConfigDir,
  getDefaultDatabasePath,
  getPidFilePath,
} from '@/infrastructure/storage/lifecycle/database-paths.js';
import type {
  EnsureExtractSessionJobInput,
  MemoryProcessingJobRecord,
  RawMessageInput,
  RawMessageRecord,
  RawSessionInput,
  RawSessionRecord,
  RawTranscript,
} from '../raw-memory/types.js';

/**
 * Database configuration
 */
interface DatabaseConfig {
  /** Database file path */
  path: string;
  /** Optional database key for legacy encrypted databases */
  key?: Buffer;
  /** Whether to enable encryption (default false) */
  enableEncryption?: boolean;
}

type SessionRecordRow = {
  id: string;
  kind: string;
  source_ref: string;
  created_at: number | null;
  updated_at: number | null;
  started_at: number | null;
  ended_at: number | null;
  metadata: string | null;
};

type SessionMessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  sequence: number;
  created_at: number | null;
  metadata: string | null;
};

type SessionRecordFreshnessRow = SessionRecordRow & {
  freshness_value: number | null;
};

/**
 * SQLCipher database encapsulation
 *
 * ## Singleton life cycle
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────┐
 * │ CorivoDatabase singleton │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  getInstance(path, key)                                       │
 * │       │                                                      │
 * │       ▼                                                      │
 * │  ┌─────────────────┐                                        │
 * │ │ Check WAL lock │ ◄── Prevent unreleased locks from causing startup failure │
 * │  │ (stale lock)    │                                        │
 * │  └────────┬────────┘                                        │
 * │           │                                                  │
 * │           ▼                                                  │
 * │  ┌─────────────────┐                                        │
 * │ │ Create instance │ If path already exists, return cached instance │
 * │ │ (cached in Map) │ │
 * │  └────────┬────────┘                                        │
 * │           │                                                  │
 * │           ▼                                                  │
 * │ ┌─────────────────┐ Instance life cycle = process life cycle │
 * │ │ initialize() │ close() is only called when the process exits │
 * │ │ - WAL mode │ │
 * │ │ - Schema creation │ │
 * │  └─────────────────┘                                        │
 * │                                                              │
 * │  closeAll()                                                   │
 * │       │                                                      │
 * │ └── Close all cache connections and clear the Map │
 * │                                                              │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## WAL lock handling
 *
 * - In WAL mode, -wal and -shm files are automatically managed by SQLite
 * - The process exits abnormally (SIGKILL) may cause the lock to not be released
 * - Detect and clean stale lock files on startup
 * - SQLite will automatically clean up the WAL file during normal shutdown
 */
export class CorivoDatabase {
  private db: SQLiteDatabase;
  private static instances: Map<string, CorivoDatabase> = new Map();
  private enableEncryption: boolean;
  private useSQLCipher: boolean = false;

  private constructor(private config: DatabaseConfig) {
    // Save encryption configuration
    this.enableEncryption = config.enableEncryption ?? false;
    // Detect and clean up stale WAL locks before startup
    this.detectAndCleanupStaleLock();
    this.db = new Database(config.path);
    this.initialize();
  }

  /**
   * Get the database instance (singleton mode, connection pool)
   *
   * Only one instance will be created for the database with the same path, and subsequent calls will return the cached instance.
   * The instance life cycle is consistent with the process life cycle, and the caller does not need to shut down manually.
   *
   * @param config - database configuration
   * @returns database instance (cached or new)
   */
  static getInstance(config: DatabaseConfig): CorivoDatabase {
    const key = config.path;
    if (!this.instances.has(key)) {
      this.instances.set(key, new CorivoDatabase(config));
    }
    return this.instances.get(key)!;
  }

  /**
   * Close all database connections
   */
  static closeAll(): void {
    for (const db of this.instances.values()) {
      db.close();
    }
    this.instances.clear();
  }

  /**
   * Detect and clean stale WAL lock files
   *
   * When a process exits abnormally (such as SIGKILL), the WAL file may not be cleaned up.
   * This method detects at startup whether another process holds the lock and cleans up stale files if not.
   *
   * ## Detection logic
   * 1. Check whether the -wal and -shm files exist
   * 2. Try to open the database in exclusive mode (SQLite’s locking mechanism)
   * 3. If successful, it means that no other process holds the lock and it can be safely cleaned up.
   * 4. If it fails, throw an error and let the user handle it.
   *
   * @throws {DatabaseError} if the database is locked by another process
   */
  private detectAndCleanupStaleLock(): void {
    // WAL files are automatically managed by SQLite without manual intervention.
    // Even if the process crashes, SQLite automatically restores the WAL the next time it is opened.
    // Manual deletion of WAL will result in loss of uncheckpointed data.
  }

  /**
   * Initialize database
   */
  private initialize(): void {
    // If encryption is enabled, try using SQLCipher
    if (this.enableEncryption) {
      this.useSQLCipher = this.trySetupSQLCipher();
    }

    // Enable WAL mode (supports concurrent reading and writing)
    this.db.pragma('journal_mode = WAL');

    // Other configurations
    this.db.pragma('foreign_keys = OFF'); // Do not use foreign keys
    this.db.pragma('synchronous = NORMAL'); // Balance performance and security
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');

    this.createSchema();
  }

  private getContentKey(): Buffer {
    if (!this.config.key) {
      throw new DatabaseError('Missing database key for encrypted content operations');
    }
    return this.config.key;
  }

  /**
   * Try setting up SQLCipher encryption
   *
   * @returns Whether SQLCipher was successfully set up
   */
  private trySetupSQLCipher(): boolean {
    try {
      if (!this.config.key) {
        throw new Error('Missing database key');
      }
      const hexKey = this.config.key.toString('hex');

      // Set encryption key
      this.db.pragma(`key = "x'${hexKey}'"`);

      // Try querying cipher_version to verify that SQLCipher is available
      const result = this.db.pragma('cipher_version');
      this.useSQLCipher = result !== undefined;

      if (this.useSQLCipher) {
        // SQLCipher is available, configure encryption parameters
        // Strengthening key derivation using PBKDF2
        this.db.pragma('kdf_iter = 256000'); // PBKDF2 iteration number
        this.db.pragma('cipher_page_size = 4096');
      }

      return this.useSQLCipher;
    } catch {
      // SQLCipher is unavailable, falling back to application layer encryption
      return false;
    }
  }

  /**
   * Create database table structure
   */
  private createSchema(): void {
    // Blocks table (skip if already exists)
    // Use sqlite_master to check if the table already exists
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'"
    ).get() as { name: string } | undefined;

    if (!tableExists) {
      // New database: Create complete structure
      this.db.exec(`
        CREATE TABLE blocks (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          annotation TEXT DEFAULT 'pending',
          refs TEXT DEFAULT '[]',
          source TEXT DEFAULT 'manual',
          vitality INTEGER DEFAULT 100,
          status TEXT DEFAULT 'active',
          access_count INTEGER DEFAULT 0,
          last_accessed INTEGER,
          pattern TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now')))
      `);
    }

    // FTS5 full text search table
    // Use standalone FTS5 tables (rather than external content) to avoid virtual table rot issues
    // Data is automatically synchronized via triggers
    //
    // Migration logic: detect and repair old versions of external content tables
    const ftsTable = this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='blocks_fts'"
    ).get() as { sql: string } | undefined;

    if (ftsTable && ftsTable.sql.includes("content='blocks'")) {
      // Old version: external table of contents schema, needs to be rebuilt
      this.db.exec(`DROP TABLE IF EXISTS blocks_fts`);
      this.db.exec(`DROP TRIGGER IF EXISTS blocks_ai`);
      this.db.exec(`DROP TRIGGER IF EXISTS blocks_au`);
      this.db.exec(`DROP TRIGGER IF EXISTS blocks_ad`);
    }

    const ftsExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='blocks_fts'"
    ).get() as { name: string } | undefined;

    if (!ftsExists) {
      this.db.exec(`
        CREATE VIRTUAL TABLE blocks_fts USING fts5(
          id UNINDEXED,
          content,
          annotation
        )
      `);

      // Trigger: INSERT synchronization
      this.db.exec(`
        CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
          INSERT INTO blocks_fts(id, content, annotation)
          VALUES (new.id, new.content, new.annotation);
        END
      `);

      // Trigger: UPDATE synchronization (reinsert after deletion to avoid FTS5 rot)
      this.db.exec(`
        CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN
          DELETE FROM blocks_fts WHERE id = old.id;
          INSERT INTO blocks_fts(id, content, annotation)
          VALUES (new.id, new.content, new.annotation);
        END
      `);

      // Trigger: DELETE sync
      this.db.exec(`
        CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
          DELETE FROM blocks_fts WHERE id = old.id;
        END
      `);

      // Reindex: synchronize data from existing blocks table
      this.db.exec(`
        INSERT INTO blocks_fts(id, content, annotation)
        SELECT id, content, annotation FROM blocks
      `);
    }

    // Index
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);
      CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
      CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);
      CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blocks(created_at);
    `);

    // Associations table (association table)
    const assocTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='associations'"
    ).get() as { name: string } | undefined;

    if (!assocTable) {
      this.db.exec(`
        CREATE TABLE associations (
          id TEXT PRIMARY KEY,
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          type TEXT NOT NULL,
          direction TEXT NOT NULL DEFAULT 'one_way',
          confidence REAL NOT NULL,
          reason TEXT,
          context_tags TEXT DEFAULT '[]',
          created_at INTEGER NOT NULL,
          UNIQUE(from_id, to_id, type))
      `);

      // Related table index
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_associations_from ON associations(from_id);
        CREATE INDEX IF NOT EXISTS idx_associations_to ON associations(to_id);
        CREATE INDEX IF NOT EXISTS idx_associations_type ON associations(type);
        CREATE INDEX IF NOT EXISTS idx_associations_confidence ON associations(confidence);
      `);
    }

    // Query logs table (query history)
    const queryLogsTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='query_logs'"
    ).get() as { name: string } | undefined;

    if (!queryLogsTable) {
      this.db.exec(`
        CREATE TABLE query_logs (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          query TEXT NOT NULL,
          result_count INTEGER DEFAULT 0)
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
      `);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_sessions (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        external_session_id TEXT NOT NULL,
        session_key TEXT NOT NULL,
        source_type TEXT NOT NULL,
        project_identity TEXT,
        started_at INTEGER,
        ended_at INTEGER,
        last_message_at INTEGER,
        last_import_cursor TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(host, external_session_id),
        UNIQUE(session_key)
      );

      CREATE INDEX IF NOT EXISTS idx_raw_sessions_host ON raw_sessions(host);
      CREATE INDEX IF NOT EXISTS idx_raw_sessions_last_message_at ON raw_sessions(last_message_at);

      CREATE TABLE IF NOT EXISTS raw_messages (
        id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        external_message_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        created_at INTEGER,
        ingested_from TEXT NOT NULL,
        ingest_event_id TEXT,
        created_db_at INTEGER NOT NULL,
        updated_db_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_messages_external
      ON raw_messages(session_key, external_message_id)
      WHERE external_message_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_messages_ordinal_role
      ON raw_messages(session_key, ordinal, role)
      WHERE external_message_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_raw_messages_session_ordinal
      ON raw_messages(session_key, ordinal, created_at, created_db_at);

      CREATE TABLE IF NOT EXISTS memory_processing_jobs (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        session_key TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        priority INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        available_at INTEGER NOT NULL,
        claimed_at INTEGER,
        finished_at INTEGER,
        last_error TEXT,
        payload_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_processing_jobs_status_available
      ON memory_processing_jobs(status, available_at, priority DESC, created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_processing_jobs_session_key
      ON memory_processing_jobs(session_key);

      CREATE TABLE IF NOT EXISTS host_import_cursors (
        host TEXT PRIMARY KEY,
        last_import_cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const sessionRecordsTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='session_records'"
    ).get() as { name: string } | undefined;

    if (!sessionRecordsTable) {
      this.db.exec(`
        CREATE TABLE session_records (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          source_ref TEXT NOT NULL,
          created_at INTEGER,
          updated_at INTEGER,
          started_at INTEGER,
          ended_at INTEGER,
          metadata TEXT DEFAULT '{}'
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_session_records_updated_at
        ON session_records(updated_at);
        CREATE INDEX IF NOT EXISTS idx_session_records_kind
        ON session_records(kind);
      `);
    }

    const sessionMessagesTable = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='session_messages'"
    ).get() as { name: string } | undefined;

    if (!sessionMessagesTable) {
      this.db.exec(`
        CREATE TABLE session_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          created_at INTEGER,
          metadata TEXT DEFAULT '{}'
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
        ON session_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_messages_sequence
        ON session_messages(session_id, sequence);
      `);
    }

    // Migration M001: Clean up low-quality summary blocks (automatically generated by heartbeat:consolidation)
    // createSummary has been removed. The historical summary block information has low value and should be deleted directly.
    // Use PRAGMA user_version to record the executed migration version number (≥1 means M001 has been executed)
    const userVersion = (this.db.pragma('user_version', { simple: true }) as number) ?? 0;
    if (userVersion < 1) {
      this.db.exec(`
        DELETE FROM blocks
        WHERE source = 'heartbeat:consolidation'
          AND annotation LIKE '%摘要%'
      `);
      this.db.pragma('user_version = 1');
    }
  }

  /**
   * Create Block
   *
   * @param input - Block creation parameter
   * Block created by @returns
   */
  createBlock(input: CreateBlockInput): Block {
    // Verify content
    if (!input.content || input.content.trim().length === 0) {
      throw new DatabaseError('Block 内容不能为空');
    }

    // Verify content length (limit 1MB)
    if (input.content.length > 1024 * 1024) {
      throw new DatabaseError('Block 内容超出最大长度限制 (1MB)');
    }

    // Verify refs format
    if (input.refs !== undefined) {
      if (!Array.isArray(input.refs)) {
        throw new DatabaseError('refs 必须是数组');
      }
      // Verify that each ref is a string
      for (const ref of input.refs) {
        if (typeof ref !== 'string') {
          throw new DatabaseError('refs 中的每个元素必须是字符串');
        }
      }
    }

    // Validate pattern format (if provided)
    if (input.pattern !== undefined) {
      const pattern = input.pattern;
      // Check required fields
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

    const id = generateBlockId();
    const now = Math.floor(Date.now() / 1000);

    // If encryption is enabled but SQLCipher is not available, use application layer encryption
    const contentToStore = (this.enableEncryption && !this.useSQLCipher)
      ? KeyManager.encryptContent(input.content, this.getContentKey())
      : input.content;

    const stmt = this.db.prepare(`
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
        now
      );
    } catch (error) {
      throw new DatabaseError('创建 Block 失败', { cause: error, blockId: id });
    }

    // Returns the complete Block object (including default values)
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

  /**
   * Creates or updates a Block with the specified ID.
   *
   * Used to import remote synchronization data to prevent createBlock() from always generating new IDs.
   */
  upsertBlock(input: CreateBlockInput & { id: string }): Block {
    if (!input.id || input.id.trim().length === 0) {
      throw new DatabaseError('Block ID 不能为空');
    }
    if (!input.content || input.content.trim().length === 0) {
      throw new DatabaseError('Block 内容不能为空');
    }
    if (input.content.length > 1024 * 1024) {
      throw new DatabaseError('Block 内容超出最大长度限制 (1MB)');
    }

    const existing = this.getBlock(input.id);
    const now = Math.floor(Date.now() / 1000);
    const contentToStore = (this.enableEncryption && !this.useSQLCipher)
      ? KeyManager.encryptContent(input.content, this.getContentKey())
      : input.content;

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

    const stmt = this.db.prepare(`
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
        merged.updated_at
      );
    } catch (error) {
      throw new DatabaseError('导入 Block 失败', { cause: error, blockId: input.id });
    }

    return merged;
  }

  /**
   * Get Block
   *
   * @param id - Block ID
   * @returns Block or null
   */
  getBlock(id: string): Block | null {
    const stmt = this.db.prepare('SELECT * FROM blocks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;
    return this.rowToBlock(row);
  }

  /**
   * Update Block
   *
   * @param id - Block ID
   * @param updates - update fields
   * @returns Whether the update is successful
   */
  updateBlock(id: string, updates: UpdateBlockInput): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      // If encryption is enabled but SQLCipher is not available, encrypt content
      const contentToStore = (this.enableEncryption && !this.useSQLCipher)
        ? KeyManager.encryptContent(updates.content, this.getContentKey())
        : updates.content;
      values.push(contentToStore);
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
      // Automatically update timestamp by default (production environment behavior)
      fields.push('updated_at = ?');
      values.push(Math.floor(Date.now() / 1000));
    }
    if (updates.created_at !== undefined) {
      fields.push('created_at = ?');
      values.push(updates.created_at);
    }
    values.push(id);

    const stmt = this.db.prepare(`UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`);

    try {
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error: any) {
      throw new DatabaseError('更新 Block 失败', { cause: error, blockId: id });
    }
  }

  /**
   * Batch update Blocks (vitality and status)
   *
   * Use transaction batch update, which is 10-100 times faster than item-by-item update
   *
   * @param updates - List of Blocks to update, each containing id, vitality and status
   * @returns The number of successful updates
   */
  batchUpdateVitality(updates: Array<{ id: string; vitality: number; status: string }>): number {
    if (updates.length === 0) return 0;

    const now = Math.floor(Date.now() / 1000);
    let updatedCount = 0;

    // Speed up batch updates using transactions
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        UPDATE blocks
        SET vitality = ?, status = ?, updated_at = ?
        WHERE id = ?
      `);

      for (const update of updates) {
        try {
          const result = stmt.run(update.vitality, update.status, now, update.id);
          updatedCount += result.changes;
        } catch (error) {
          // Failure of a single update does not affect other updates
          console.error(`批量更新失败 ${update.id}:`, error);
        }
      }
    });

    try {
      transaction();
      return updatedCount;
    } catch (error: any) {
      throw new DatabaseError('批量更新 Block 失败', { cause: error });
    }
  }

  /**
   * Delete Block
   *
   * @param id - Block ID
   * @returns Whether the deletion was successful
   */
  deleteBlock(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM blocks WHERE id = ?');

    try {
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('删除 Block 失败', { cause: error, blockId: id });
    }
  }

  // ========== Related operations ==========

  /**
   * Create association
   *
   * @param input - association creation parameter
   * Association created by @returns
   */
  createAssociation(input: CreateAssociationInput): Association {
    const id = generateAssociationId();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO associations (
        id, from_id, to_id, type, direction, confidence, reason, context_tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        input.from_id,
        input.to_id,
        input.type,
        input.direction || 'one_way',
        input.confidence,
        input.reason || null,
        JSON.stringify(input.context_tags || []),
        now
      );
    } catch (error) {
      throw new DatabaseError('创建关联失败', { cause: error, associationId: id });
    }

    return {
      id,
      from_id: input.from_id,
      to_id: input.to_id,
      type: input.type,
      direction: input.direction || 'one_way',
      confidence: input.confidence,
      reason: input.reason,
      context_tags: input.context_tags,
      created_at: now,
    } as Association;
  }

  /**
   * Create associations in batches
   *
   * @param associations - list of associations
   * @returns The number of successful creations
   */
  batchCreateAssociations(associations: CreateAssociationInput[]): number {
    if (associations.length === 0) return 0;

    let createdCount = 0;

    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO associations (
          id, from_id, to_id, type, direction, confidence, reason, context_tags, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const input of associations) {
        try {
          const id = generateAssociationId();
          const now = Date.now();

          stmt.run(
            id,
            input.from_id,
            input.to_id,
            input.type,
            input.direction || 'one_way',
            input.confidence,
            input.reason || null,
            JSON.stringify(input.context_tags || []),
            now
          );
          createdCount++;
        } catch (error) {
          // Failure of a single creation does not affect other
          console.error(`批量创建关联失败 ${input.from_id} -> ${input.to_id}:`, error);
        }
      }
    });

    try {
      transaction();
      return createdCount;
    } catch (error: any) {
      throw new DatabaseError('批量创建关联失败', { cause: error });
    }
  }

  /**
   * Query association
   *
   * @param filter - Query filter
   * @returns association list
   */
  queryAssociations(filter: AssociationFilter = {}): Association[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.from_id) {
      conditions.push('from_id = ?');
      values.push(filter.from_id);
    }
    if (filter.to_id) {
      conditions.push('to_id = ?');
      values.push(filter.to_id);
    }
    if (filter.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }
    if (filter.minConfidence !== undefined) {
      conditions.push('confidence >= ?');
      values.push(filter.minConfidence);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
    const limitClause = limit ? `LIMIT ${limit}` : '';

    const stmt = this.db.prepare(`
      SELECT * FROM associations ${whereClause} ORDER BY confidence DESC ${limitClause}
    `);

    try {
      const rows = stmt.all(...values) as any[];
      return rows.map(row => this.rowToAssociation(row));
    } catch (error) {
      throw new DatabaseError('查询关联失败', { cause: error });
    }
  }

  /**
   * Get all associations of block (bidirectional)
   *
   * @param blockId - Block ID
   * @param minConfidence - minimum confidence level
   * @returns association list
   */
  getBlockAssociations(blockId: string, minConfidence = 0.5): Association[] {
    const stmt = this.db.prepare(`
      SELECT * FROM associations
      WHERE (from_id = ? OR to_id = ?)
        AND confidence >= ?
      ORDER BY confidence DESC
    `);

    try {
      const rows = stmt.all(blockId, blockId, minConfidence) as any[];
      return rows.map(row => this.rowToAssociation(row));
    } catch (error) {
      throw new DatabaseError('获取 block 关联失败', { cause: error, blockId });
    }
  }

  /**
   * Delete association
   *
   * @param id - association ID
   * @returns Whether the deletion was successful
   */
  deleteAssociation(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM associations WHERE id = ?');

    try {
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      throw new DatabaseError('删除关联失败', { cause: error, associationId: id });
    }
  }

  /**
   * Delete all associations of block
   *
   * @param blockId - Block ID
   * @returns Number of deleted associations
   */
  deleteBlockAssociations(blockId: string): number {
    const stmt = this.db.prepare('DELETE FROM associations WHERE from_id = ? OR to_id = ?');

    try {
      const result = stmt.run(blockId, blockId);
      return result.changes;
    } catch (error) {
      throw new DatabaseError('删除 block 关联失败', { cause: error, blockId });
    }
  }

  /**
   * Get associated statistics
   *
   * @returns statistics
   */
  getAssociationStats(): AssociationStats {
    // total
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM associations');
    const { count: total } = totalStmt.get() as { count: number };

    // Group by type
    const typeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM associations GROUP BY type
    `);
    const typeRows = typeStmt.all() as Array<{ type: string; count: number }>;
    const byType: Record<AssociationType, number> = {
      [AssociationType.SIMILAR]: 0,
      [AssociationType.RELATED]: 0,
      [AssociationType.CONFLICTS]: 0,
      [AssociationType.REFINES]: 0,
      [AssociationType.SUPERSEDES]: 0,
      [AssociationType.CAUSES]: 0,
      [AssociationType.DEPENDS_ON]: 0,
    };
    for (const row of typeRows) {
      if (row.type in byType) {
        byType[row.type as AssociationType] = row.count;
      }
    }

    // average confidence
    const avgStmt = this.db.prepare('SELECT AVG(confidence) as avg FROM associations');
    const { avg } = avgStmt.get() as { avg: number | null };

    // most active block
    const activeStmt = this.db.prepare(`
      SELECT block_id, COUNT(*) as count FROM (
        SELECT from_id as block_id FROM associations
        UNION ALL
        SELECT to_id as block_id FROM associations
      )
      GROUP BY block_id
      ORDER BY count DESC
      LIMIT 10
    `);
    const mostConnected = activeStmt.all() as Array<{ block_id: string; count: number }>;

    return {
      total: total || 0,
      byType,
      avgConfidence: avg || 0,
      mostConnected,
    };
  }

  /**
   * Query Blocks
   *
   * @param filter - Query filter
   * @returns Block array
   */
  queryBlocks(filter: BlockFilter = {}): Block[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.annotation) {
      conditions.push('annotation = ?');
      values.push(filter.annotation);
    } else if (filter.annotationPrefix) {
      // Escape LIKE wildcards to prevent mismatches
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
    // Verify limit range to prevent extreme values
    const limit = filter.limit ? Math.max(1, Math.min(filter.limit, 10000)) : null;
    const limitClause = limit ? `LIMIT ${limit}` : '';

    // Sorting: sortBy and sortOrder are both from the whitelist, and there is no risk of SQL injection
    const sortColumn = filter.sortBy === 'vitality' ? 'vitality' : 'updated_at';
    const sortDirection = filter.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const stmt = this.db.prepare(`
      SELECT * FROM blocks ${whereClause} ORDER BY ${sortColumn} ${sortDirection} ${limitClause}
    `);

    try {
      const rows = stmt.all(...values) as any[];
      return rows.map(row => this.rowToBlock(row));
    } catch (error) {
      throw new DatabaseError('查询 Blocks 失败', { cause: error });
    }
  }

  querySessionRecords(query: SessionRecordQuery = {}): SessionRecord[] {
    const freshnessSql = 'COALESCE(updated_at, ended_at, created_at, started_at)';
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query.sessionKind) {
      conditions.push('kind = ?');
      values.push(query.sessionKind);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = `ORDER BY ${freshnessSql} DESC, id DESC`;
    const recordStmt = this.db.prepare(`
      SELECT
        id,
        kind,
        source_ref,
        created_at,
        updated_at,
        started_at,
        ended_at,
        metadata,
        ${freshnessSql} AS freshness_value
      FROM session_records
      ${whereClause}
      ${orderClause}
    `);
    const messageStmt = this.db.prepare(`
      SELECT
        id,
        session_id,
        role,
        content,
        sequence,
        created_at,
        metadata
      FROM session_messages
      WHERE session_id = ?
      ORDER BY sequence ASC, created_at ASC, id ASC
    `);

    try {
      const rows = recordStmt.all(...values) as SessionRecordFreshnessRow[];
      return rows.map((row) =>
        this.rowToSessionRecord(
          row,
          messageStmt.all(row.id) as SessionMessageRow[],
        )
      );
    } catch (error) {
      throw new DatabaseError('查询 Session Records 失败', { cause: error });
    }
  }

  /**
   * Search blocks with FTS5 full-text search
   *
   * Full-text search using FTS5's MATCH operator, returning results sorted by relevance.
   *
   * @param query - Search query
   * @param limit - Maximum number of results to return
   * @returns Matching blocks
   */
  searchBlocks(query: string, limit = 10): Block[] {
    // Empty queries fall back to the standard block listing
    if (!query || query.trim() === '') {
      return this.queryBlocks({ limit });
    }

    // With application-layer encryption, SQL only sees ciphertext.
    // Fall back to decrypting rows in memory and matching there.
    if (this.enableEncryption && !this.useSQLCipher) {
      const allRows = this.db.prepare('SELECT * FROM blocks ORDER BY updated_at DESC').all() as any[];
      const matched: Block[] = [];
      for (const row of allRows) {
        const block = this.rowToBlock(row);
        if (block.content.includes(query) || block.annotation.includes(query)) {
          matched.push(block);
          if (matched.length >= limit) break;
        }
      }
      return matched;
    }

    // Prefer FTS5 full-text search when it is available
    const ftsStmt = this.db.prepare(`
      SELECT b.* FROM blocks b
      INNER JOIN blocks_fts fts ON b.id = fts.id
      WHERE blocks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    try {
      // Escape special characters in query string
      const escapedQuery = query.replace(/["']/g, '');
      const rows = ftsStmt.all(escapedQuery, limit) as any[];

      // FTS5 returns the result directly.
      if (rows.length > 0) {
        return rows.map(row => this.rowToBlock(row));
      }
    } catch (error) {
      // FTS5 query fails, ignore error, continue using alternate search
    }

    // Use LIKE backup search when FTS5 has no results or fails
    // This is especially useful for Chinese searches, as FTS5 has poor support for Chinese word segmentation
    const likeStmt = this.db.prepare(`
      SELECT * FROM blocks
      WHERE content LIKE ? OR annotation LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const likePattern = `%${query}%`;
    const rows = likeStmt.all(likePattern, likePattern, limit) as any[];
    return rows.map(row => this.rowToBlock(row));
  }

  /**
   * Get statistics
   *
   * @returns statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byAnnotation: Record<string, number>;
  } {
    // total
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM blocks');
    const { count: total } = totalStmt.get() as { count: number };

    // Group by status
    const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM blocks GROUP BY status
    `);
    const statusRows = statusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
    }

    // Group by label (only take top 5)
    const annotationStmt = this.db.prepare(`
      SELECT annotation, COUNT(*) as count FROM blocks GROUP BY annotation ORDER BY count DESC LIMIT 5
    `);
    const annotationRows = annotationStmt.all() as Array<{ annotation: string; count: number }>;
    const byAnnotation: Record<string, number> = {};
    for (const row of annotationRows) {
      byAnnotation[row.annotation] = row.count;
    }

    return { total, byStatus, byAnnotation };
  }

  /**
   * Get state distribution (for context push)
   *
   * Use SQL GROUP BY to aggregate at the database level to avoid reading all data into memory
   *
   * @returns The number of blocks in each state
   */
  getStatusBreakdown(): {
    total: number;
    active: number;
    cooling: number;
    cold: number;
    archived: number;
  } {
    // A single SQL statement completes all aggregation
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'cooling' THEN 1 ELSE 0 END) as cooling,
        SUM(CASE WHEN status = 'cold' THEN 1 ELSE 0 END) as cold,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
      FROM blocks
    `);

    const row = stmt.get() as {
      total: number;
      active: number;
      cooling: number;
      cold: number;
      archived: number;
    };

    // The SUM returned by SQLite may be null (when there are no records)
    return {
      total: row.total || 0,
      active: row.active || 0,
      cooling: row.cooling || 0,
      cold: row.cold || 0,
      archived: row.archived || 0,
    };
  }

  /**
   * health check
   *
   * @returns health check results
   */
  checkHealth(): {
    ok: boolean;
    integrity?: string;
    size?: number;
    path?: string;
    blockCount?: number;
  } {
    try {
      // integrity check
      const integrityResult = this.db.pragma('integrity_check');
      // integrity_check returns [{ integrity_check: 'ok' }] or similar structure
      const ok = Array.isArray(integrityResult)
        ? integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok'
        : String(integrityResult) === 'ok';

      // File size - pragma return value may be an array or a direct value
      const pageSizeResult = this.db.pragma('page_size') as any;
      const pageCountResult = this.db.pragma('page_count') as any;

      const pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
      const pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;

      const size = (pageSize || 0) * (pageCount || 0);

      // Get the number of blocks
      const count = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get() as { count: number };

      return {
        ok,
        integrity: ok ? 'ok' : String(integrityResult),
        size,
        path: this.config.path,
        blockCount: count.count,
      };
    } catch (error) {
      return {
        ok: false,
        path: this.config.path,
      };
    }
  }

  /**
   * Get all the data you need for the TUI status panel
   */
  getTUIStats(): {
    total: number;
    weeklyNew: number;
    associations: number;
    queryHits: number;
    byNature: Record<string, number>;
    byStatus: Record<string, number>;
    recentBlocks: Array<{ id: string; content: string; annotation: string; vitality: number; created_at: number }>;
    dbSize: number;
  } {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

    const total = (this.db.prepare('SELECT COUNT(*) as count FROM blocks').get() as { count: number }).count;
    const weeklyNew = (this.db.prepare('SELECT COUNT(*) as count FROM blocks WHERE created_at > ?').get(weekAgo) as { count: number }).count;

    let associations = 0;
    try { associations = (this.db.prepare('SELECT COUNT(*) as count FROM associations').get() as { count: number }).count; } catch {}

    let queryHits = 0;
    try { queryHits = (this.db.prepare('SELECT COUNT(*) as count FROM query_logs').get() as { count: number }).count; } catch {}

    const natureRows = this.db.prepare(`
      SELECT
        CASE
          WHEN annotation LIKE '决策%' THEN 'decision'
          WHEN annotation LIKE '事实%' THEN 'fact'
          WHEN annotation LIKE '知识%' THEN 'knowledge'
          WHEN annotation LIKE '指令%' THEN 'preference'
          ELSE 'other'
        END as nature,
        COUNT(*) as count
      FROM blocks
      WHERE annotation != 'pending'
      GROUP BY nature
      ORDER BY count DESC
    `).all() as Array<{ nature: string; count: number }>;

    const byNature: Record<string, number> = {};
    for (const row of natureRows) byNature[row.nature] = row.count;

    const statusRows = this.db.prepare('SELECT status, COUNT(*) as count FROM blocks GROUP BY status').all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) byStatus[row.status] = row.count;

    const recentRows = this.db.prepare(`
      SELECT id, content, annotation, vitality, created_at
      FROM blocks
      WHERE annotation != 'pending'
      ORDER BY created_at DESC
      LIMIT 5
    `).all() as Array<{ id: string; content: string; annotation: string; vitality: number; created_at: number }>;

    const pageSizeResult = this.db.pragma('page_size') as any;
    const pageCountResult = this.db.pragma('page_count') as any;
    const pageSize = Array.isArray(pageSizeResult) ? pageSizeResult[0].page_size : pageSizeResult;
    const pageCount = Array.isArray(pageCountResult) ? pageCountResult[0].page_count : pageCountResult;

    return {
      total,
      weeklyNew,
      associations,
      queryHits,
      byNature,
      byStatus,
      recentBlocks: recentRows.map(r => ({
        ...r,
        content: (this.enableEncryption && !this.useSQLCipher)
          ? KeyManager.decryptContent(r.content, this.getContentKey())
          : r.content,
      })),
      dbSize: (pageSize || 0) * (pageCount || 0),
    };
  }

  upsertRawSession(input: RawSessionInput): RawSessionRecord {
    if (!input.host || !input.externalSessionId || !input.sessionKey || !input.sourceType) {
      throw new DatabaseError('Raw session 缺少必填字段');
    }

    const now = Date.now();
    const existing = this.db.prepare(`
      SELECT *
      FROM raw_sessions
      WHERE session_key = ?
         OR (host = ? AND external_session_id = ?)
      LIMIT 1
    `).get(input.sessionKey, input.host, input.externalSessionId) as any;

    const record: RawSessionRecord = {
      id: existing?.id ?? `raw_sess_${randomUUID()}`,
      host: input.host,
      externalSessionId: input.externalSessionId,
      sessionKey: input.sessionKey,
      sourceType: input.sourceType,
      projectIdentity: input.projectIdentity ?? existing?.project_identity ?? undefined,
      startedAt: input.startedAt ?? existing?.started_at ?? undefined,
      endedAt: input.endedAt ?? existing?.ended_at ?? undefined,
      lastMessageAt: input.lastMessageAt ?? existing?.last_message_at ?? undefined,
      lastImportCursor: input.lastImportCursor ?? existing?.last_import_cursor ?? undefined,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };

    if (existing) {
      this.db.prepare(`
        UPDATE raw_sessions
        SET
          host = ?,
          external_session_id = ?,
          session_key = ?,
          source_type = ?,
          project_identity = ?,
          started_at = ?,
          ended_at = ?,
          last_message_at = ?,
          last_import_cursor = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        record.host,
        record.externalSessionId,
        record.sessionKey,
        record.sourceType,
        record.projectIdentity ?? null,
        record.startedAt ?? null,
        record.endedAt ?? null,
        record.lastMessageAt ?? null,
        record.lastImportCursor ?? null,
        record.updatedAt,
        record.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO raw_sessions (
          id, host, external_session_id, session_key, source_type, project_identity,
          started_at, ended_at, last_message_at, last_import_cursor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.host,
        record.externalSessionId,
        record.sessionKey,
        record.sourceType,
        record.projectIdentity ?? null,
        record.startedAt ?? null,
        record.endedAt ?? null,
        record.lastMessageAt ?? null,
        record.lastImportCursor ?? null,
        record.createdAt,
        record.updatedAt
      );
    }

    return record;
  }

  getRawSessionByKey(sessionKey: string): RawSessionRecord | null {
    const row = this.db.prepare('SELECT * FROM raw_sessions WHERE session_key = ?').get(sessionKey) as any;
    return row ? this.rowToRawSession(row) : null;
  }

  listRawSessions(): RawSessionRecord[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM raw_sessions
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, updated_at DESC
    `).all() as any[];

    return rows.map((row) => this.rowToRawSession(row));
  }

  upsertRawMessage(input: RawMessageInput): RawMessageRecord {
    if (
      !input.sessionKey
      || !input.role
      || typeof input.content !== 'string'
      || !Number.isInteger(input.ordinal)
    ) {
      throw new DatabaseError('Raw message 缺少必填字段');
    }

    const now = Date.now();
    const existing = input.externalMessageId
      ? this.db.prepare(`
          SELECT *
          FROM raw_messages
          WHERE session_key = ?
            AND (
              external_message_id = ?
              OR (ordinal = ? AND role = ?)
            )
          ORDER BY CASE WHEN external_message_id = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).get(input.sessionKey, input.externalMessageId, input.ordinal, input.role, input.externalMessageId)
      : this.db.prepare(`
          SELECT *
          FROM raw_messages
          WHERE session_key = ? AND ordinal = ? AND role = ?
          LIMIT 1
        `).get(input.sessionKey, input.ordinal, input.role);

    const record: RawMessageRecord = {
      id: (existing as any)?.id ?? `raw_msg_${randomUUID()}`,
      sessionKey: input.sessionKey,
      externalMessageId: input.externalMessageId,
      role: input.role,
      content: input.content,
      ordinal: input.ordinal,
      createdAt: input.createdAt ?? (existing as any)?.created_at ?? undefined,
      ingestedFrom: input.ingestedFrom,
      ingestEventId: input.ingestEventId ?? (existing as any)?.ingest_event_id ?? undefined,
      createdDbAt: (existing as any)?.created_db_at ?? now,
      updatedDbAt: now,
    };

    if (existing) {
      this.db.prepare(`
        UPDATE raw_messages
        SET
          session_key = ?,
          external_message_id = ?,
          role = ?,
          content = ?,
          ordinal = ?,
          created_at = ?,
          ingested_from = ?,
          ingest_event_id = ?,
          updated_db_at = ?
        WHERE id = ?
      `).run(
        record.sessionKey,
        record.externalMessageId ?? null,
        record.role,
        record.content,
        record.ordinal,
        record.createdAt ?? null,
        record.ingestedFrom,
        record.ingestEventId ?? null,
        record.updatedDbAt,
        record.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO raw_messages (
          id, session_key, external_message_id, role, content, ordinal,
          created_at, ingested_from, ingest_event_id, created_db_at, updated_db_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.sessionKey,
        record.externalMessageId ?? null,
        record.role,
        record.content,
        record.ordinal,
        record.createdAt ?? null,
        record.ingestedFrom,
        record.ingestEventId ?? null,
        record.createdDbAt,
        record.updatedDbAt
      );
    }
    return record;
  }

  listRawMessages(sessionKey: string): RawMessageRecord[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM raw_messages
      WHERE session_key = ?
      ORDER BY ordinal ASC, COALESCE(created_at, created_db_at) ASC, created_db_at ASC
    `).all(sessionKey) as any[];

    return rows.map((row) => this.rowToRawMessage(row));
  }

  getRawTranscript(sessionKey: string): RawTranscript | null {
    const session = this.getRawSessionByKey(sessionKey);
    if (!session) {
      return null;
    }

    return {
      session,
      messages: this.listRawMessages(sessionKey),
    };
  }

  getHostImportCursor(host: HostId): string | null {
    const row = this.db.prepare(`
      SELECT last_import_cursor
      FROM host_import_cursors
      WHERE host = ?
    `).get(host) as { last_import_cursor: string } | undefined;

    return row?.last_import_cursor ?? null;
  }

  setHostImportCursor(host: HostId, cursor: string): void {
    if (!host || !cursor) {
      throw new DatabaseError('Host import cursor 缺少必填字段');
    }

    const now = Date.now();
    this.db.prepare(`
      INSERT INTO host_import_cursors (host, last_import_cursor, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(host) DO UPDATE SET
        last_import_cursor = excluded.last_import_cursor,
        updated_at = excluded.updated_at
    `).run(host, cursor, now);
  }

  ensureExtractSessionProcessingJob(input: EnsureExtractSessionJobInput): MemoryProcessingJobRecord {
    if (!input.host || !input.sessionKey) {
      throw new DatabaseError('Memory processing job 缺少必填字段');
    }

    const now = Date.now();
    const dedupeKey = `extract-session:${input.sessionKey}`;
    const existing = this.db.prepare(`
      SELECT *
      FROM memory_processing_jobs
      WHERE dedupe_key = ?
      LIMIT 1
    `).get(dedupeKey) as any;
    const isTerminal = existing
      ? existing.status === 'succeeded' || existing.status === 'failed' || existing.status === 'cancelled'
      : false;

    const record: MemoryProcessingJobRecord = {
      id: existing?.id ?? `job_${randomUUID()}`,
      host: input.host,
      sessionKey: input.sessionKey,
      jobType: 'extract-session',
      status: 'pending',
      dedupeKey,
      priority: input.priority ?? existing?.priority ?? 0,
      attemptCount: isTerminal ? 0 : (existing?.attempt_count ?? 0),
      availableAt: input.availableAt ?? now,
      claimedAt: null,
      finishedAt: null,
      lastError: null,
      payloadJson: existing?.payload_json ?? null,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO memory_processing_jobs (
        id, host, session_key, job_type, status, dedupe_key, priority, attempt_count,
        available_at, claimed_at, finished_at, last_error, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        host = excluded.host,
        session_key = excluded.session_key,
        job_type = excluded.job_type,
        status = excluded.status,
        priority = excluded.priority,
        available_at = excluded.available_at,
        claimed_at = excluded.claimed_at,
        finished_at = excluded.finished_at,
        last_error = excluded.last_error,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.host,
      record.sessionKey,
      record.jobType,
      record.status,
      record.dedupeKey,
      record.priority,
      record.attemptCount,
      record.availableAt,
      record.claimedAt,
      record.finishedAt,
      record.lastError,
      record.payloadJson,
      record.createdAt,
      record.updatedAt
    );

    return record;
  }

  listPendingMemoryProcessingJobs(): MemoryProcessingJobRecord[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM memory_processing_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, available_at ASC, created_at ASC
    `).all() as any[];

    return rows.map((row) => this.rowToMemoryProcessingJob(row));
  }

  claimNextMemoryProcessingJob(now = Date.now()): MemoryProcessingJobRecord | null {
    const claim = this.db.transaction((claimedAt: number) => {
      const candidate = this.db.prepare(`
        SELECT *
        FROM memory_processing_jobs
        WHERE status = 'pending' AND available_at <= ?
        ORDER BY priority DESC, available_at ASC, created_at ASC
        LIMIT 1
      `).get(claimedAt) as any;

      if (!candidate) {
        return null;
      }

      const updatedAt = Date.now();
      const result = this.db.prepare(`
        UPDATE memory_processing_jobs
        SET
          status = 'running',
          attempt_count = attempt_count + 1,
          claimed_at = ?,
          updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(claimedAt, updatedAt, candidate.id);

      if (result.changes === 0) {
        return null;
      }

      return this.rowToMemoryProcessingJob({
        ...candidate,
        status: 'running',
        attempt_count: candidate.attempt_count + 1,
        claimed_at: claimedAt,
        updated_at: updatedAt,
      });
    });

    return claim(now);
  }

  markMemoryProcessingJobSucceeded(id: string): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE memory_processing_jobs
      SET
        status = 'succeeded',
        finished_at = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(now, now, id);
  }

  markMemoryProcessingJobFailed(id: string, error: string, nextAvailableAt?: number): void {
    const now = Date.now();

    if (nextAvailableAt !== undefined) {
      this.db.prepare(`
        UPDATE memory_processing_jobs
        SET
          status = 'pending',
          available_at = ?,
          claimed_at = NULL,
          finished_at = NULL,
          last_error = ?,
          updated_at = ?
        WHERE id = ? AND status = 'running'
      `).run(nextAvailableAt, error, now, id);
      return;
    }

    this.db.prepare(`
      UPDATE memory_processing_jobs
      SET
        status = 'failed',
        finished_at = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(now, error, now, id);
  }

  /**
   * Close database connection
   *
   * SQLite automatically cleans up WAL files on shutdown.
   * If the process is killed by SIGKILL, the WAL file may remain and will be automatically detected and cleaned up the next time it is started.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database rows to Block objects
   */
  private rowToBlock(row: any): Block {
    // If encryption is enabled but SQLCipher is not available, decrypt content
    const content = (this.enableEncryption && !this.useSQLCipher)
      ? KeyManager.decryptContent(row.content, this.getContentKey())
      : row.content;

    return {
      id: row.id,
      content,
      annotation: row.annotation,
      refs: JSON.parse(row.refs || '[]'),
      source: row.source,
      vitality: row.vitality,
      status: row.status,
      access_count: row.access_count,
      last_accessed: row.last_accessed,
      pattern: row.pattern ? JSON.parse(row.pattern) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToSessionRecord(row: SessionRecordRow, messages: SessionMessageRow[]): SessionRecord {
    const metadata = this.parseJsonObject(row.metadata);

    return {
      id: row.id,
      sessionId: row.id,
      kind: row.kind,
      host: this.deriveSessionHost(row.kind, row.source_ref),
      sourceRef: row.source_ref,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      endedAt: row.ended_at ?? undefined,
      messages: messages.map((message) => this.rowToSessionMessage(message)),
      ...(metadata ? { metadata } : {}),
    };
  }

  private rowToSessionMessage(row: SessionMessageRow): SessionMessage {
    const metadata = this.parseJsonObject(row.metadata);

    return {
      id: row.id,
      role: row.role,
      content: row.content,
      sequence: row.sequence,
      createdAt: row.created_at ?? undefined,
      ...(metadata ? { metadata } : {}),
    };
  }

  private deriveSessionHost(kind: string, sourceRef: string): string {
    if (kind.endsWith('-session')) {
      return kind.slice(0, -'-session'.length);
    }

    const protocolSeparator = sourceRef.indexOf('://');
    if (protocolSeparator > 0) {
      return sourceRef.slice(0, protocolSeparator);
    }

    return 'unknown';
  }

  private parseJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        return Object.keys(record).length > 0 ? record : undefined;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /**
   * Convert database rows to Association objects
   */
  private rowToAssociation(row: any): Association {
    return {
      id: row.id,
      from_id: row.from_id,
      to_id: row.to_id,
      type: row.type as AssociationType,
      direction: row.direction,
      confidence: row.confidence,
      reason: row.reason,
      context_tags: row.context_tags ? JSON.parse(row.context_tags) : undefined,
      created_at: row.created_at,
    };
  }

  private rowToRawSession(row: any): RawSessionRecord {
    return {
      id: row.id,
      host: row.host as HostId,
      externalSessionId: row.external_session_id,
      sessionKey: row.session_key,
      sourceType: row.source_type,
      projectIdentity: row.project_identity ?? undefined,
      startedAt: row.started_at ?? undefined,
      endedAt: row.ended_at ?? undefined,
      lastMessageAt: row.last_message_at ?? undefined,
      lastImportCursor: row.last_import_cursor ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToRawMessage(row: any): RawMessageRecord {
    return {
      id: row.id,
      sessionKey: row.session_key,
      externalMessageId: row.external_message_id ?? undefined,
      role: row.role,
      content: row.content,
      ordinal: row.ordinal,
      createdAt: row.created_at ?? undefined,
      ingestedFrom: row.ingested_from,
      ingestEventId: row.ingest_event_id ?? undefined,
      createdDbAt: row.created_db_at,
      updatedDbAt: row.updated_db_at,
    };
  }

  private rowToMemoryProcessingJob(row: any): MemoryProcessingJobRecord {
    return {
      id: row.id,
      host: row.host as HostId,
      sessionKey: row.session_key,
      jobType: row.job_type,
      status: row.status,
      dedupeKey: row.dedupe_key,
      priority: row.priority,
      attemptCount: row.attempt_count,
      availableAt: row.available_at,
      claimedAt: row.claimed_at ?? null,
      finishedAt: row.finished_at ?? null,
      lastError: row.last_error ?? null,
      payloadJson: row.payload_json ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get encrypted information (for status display)
   */
  getEncryptionInfo(): { enabled: boolean; method: 'sqlcipher' | 'application' | 'none' } {
    if (!this.enableEncryption) {
      return { enabled: false, method: 'none' };
    }
    return {
      enabled: true,
      method: this.useSQLCipher ? 'sqlcipher' : 'application',
    };
  }
}

export { getConfigDir, getDefaultDatabasePath, getPidFilePath };
