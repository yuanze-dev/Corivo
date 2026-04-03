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
} from '@/domain/memory/models/index.js';
import type { HostId } from '@/domain/host/contracts/types.js';
import {
  getConfigDir,
  getDefaultDatabasePath,
  getPidFilePath,
} from '@/infrastructure/storage/lifecycle/database-paths.js';
import { ensureDatabaseSchema } from '@/infrastructure/storage/schema/database-schema.js';
import { BlockRepository } from '@/infrastructure/storage/repositories/block-repository.js';
import { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import { HostImportCursorStore } from '@/infrastructure/storage/repositories/host-import-cursor-store.js';
import { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue.js';
import { AssociationRepository } from '@/infrastructure/storage/repositories/association-repository.js';
import { DatabaseStatsRepository } from '@/infrastructure/storage/repositories/database-stats-repository.js';
import { searchBlocksWithRuntime } from '@/infrastructure/storage/search/block-search.js';
import { SessionRecordRepository } from '@/infrastructure/storage/repositories/session-record-repository.js';
import {
  mapRowToAssociation,
  mapRowToBlock,
  mapRowToMemoryProcessingJob,
  mapRowToRawMessage,
  mapRowToRawSession,
  mapRowToSessionRecord,
} from '@/infrastructure/storage/repositories/row-mappers.js';
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
  private readonly blockRepository: BlockRepository;
  private readonly associationRepository: AssociationRepository;
  private readonly rawMemoryRepository: RawMemoryRepository;
  private readonly hostImportCursorStore: HostImportCursorStore;
  private readonly memoryProcessingJobQueue: MemoryProcessingJobQueue;
  private readonly databaseStatsRepository: DatabaseStatsRepository;
  private readonly sessionRecordRepository: SessionRecordRepository;

  private constructor(private config: DatabaseConfig) {
    // Save encryption configuration
    this.enableEncryption = config.enableEncryption ?? false;
    // Detect and clean up stale WAL locks before startup
    this.detectAndCleanupStaleLock();
    this.db = new Database(config.path);
    this.blockRepository = new BlockRepository({
      db: this.db as any,
      enableEncryption: this.enableEncryption,
      useSQLCipher: this.useSQLCipher,
      getContentKey: () => this.getContentKey(),
      rowToBlock: (row: unknown) => this.rowToBlock(row),
    });
    this.associationRepository = new AssociationRepository({
      db: this.db as any,
      rowToAssociation: (row: unknown) => this.rowToAssociation(row),
    });
    this.rawMemoryRepository = new RawMemoryRepository({
      db: this.db as any,
      rowToRawSession: (row: unknown) => this.rowToRawSession(row),
      rowToRawMessage: (row: unknown) => this.rowToRawMessage(row),
    });
    this.hostImportCursorStore = new HostImportCursorStore(this.db as any);
    this.memoryProcessingJobQueue = new MemoryProcessingJobQueue(
      this.db as any,
      (row: unknown) => this.rowToMemoryProcessingJob(row),
    );
    this.databaseStatsRepository = new DatabaseStatsRepository({
      db: this.db as any,
      path: this.config.path,
      enableEncryption: this.enableEncryption,
      useSQLCipher: this.useSQLCipher,
      getContentKey: () => this.getContentKey(),
      rowToBlock: (row: unknown) => this.rowToBlock(row),
    });
    this.sessionRecordRepository = new SessionRecordRepository({
      db: this.db as any,
      rowToSessionRecord: (row: unknown, messages: unknown[]) => this.rowToSessionRecord(row, messages as any[]),
    });
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
    ensureDatabaseSchema({ db: this.db as any });
  }

  /**
   * Create Block
   *
   * @param input - Block creation parameter
   * Block created by @returns
   */
  createBlock(input: CreateBlockInput): Block {
    return this.blockRepository.create(input);
  }

  /**
   * Creates or updates a Block with the specified ID.
   *
   * Used to import remote synchronization data to prevent createBlock() from always generating new IDs.
   */
  upsertBlock(input: CreateBlockInput & { id: string }): Block {
    return this.blockRepository.upsert(input);
  }

  /**
   * Get Block
   *
   * @param id - Block ID
   * @returns Block or null
   */
  getBlock(id: string): Block | null {
    return this.blockRepository.getById(id);
  }

  /**
   * Update Block
   *
   * @param id - Block ID
   * @param updates - update fields
   * @returns Whether the update is successful
   */
  updateBlock(id: string, updates: UpdateBlockInput): boolean {
    return this.blockRepository.update(id, updates);
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
    return this.blockRepository.batchUpdateVitality(updates);
  }

  /**
   * Delete Block
   *
   * @param id - Block ID
   * @returns Whether the deletion was successful
   */
  deleteBlock(id: string): boolean {
    return this.blockRepository.delete(id);
  }

  // ========== Related operations ==========

  /**
   * Create association
   *
   * @param input - association creation parameter
   * Association created by @returns
   */
  createAssociation(input: CreateAssociationInput): Association {
    return this.associationRepository.create(input);
  }

  /**
   * Create associations in batches
   *
   * @param associations - list of associations
   * @returns The number of successful creations
   */
  batchCreateAssociations(associations: CreateAssociationInput[]): number {
    return this.associationRepository.batchCreate(associations);
  }

  /**
   * Query association
   *
   * @param filter - Query filter
   * @returns association list
   */
  queryAssociations(filter: AssociationFilter = {}): Association[] {
    return this.associationRepository.query(filter);
  }

  /**
   * Get all associations of block (bidirectional)
   *
   * @param blockId - Block ID
   * @param minConfidence - minimum confidence level
   * @returns association list
   */
  getBlockAssociations(blockId: string, minConfidence = 0.5): Association[] {
    return this.associationRepository.getBlockAssociations(blockId, minConfidence);
  }

  /**
   * Delete association
   *
   * @param id - association ID
   * @returns Whether the deletion was successful
   */
  deleteAssociation(id: string): boolean {
    return this.associationRepository.delete(id);
  }

  /**
   * Delete all associations of block
   *
   * @param blockId - Block ID
   * @returns Number of deleted associations
   */
  deleteBlockAssociations(blockId: string): number {
    return this.associationRepository.deleteByBlock(blockId);
  }

  /**
   * Get associated statistics
   *
   * @returns statistics
   */
  getAssociationStats(): AssociationStats {
    return this.associationRepository.getStats();
  }

  /**
   * Query Blocks
   *
   * @param filter - Query filter
   * @returns Block array
   */
  queryBlocks(filter: BlockFilter = {}): Block[] {
    return this.blockRepository.query(filter);
  }

  querySessionRecords(query: SessionRecordQuery = {}): SessionRecord[] {
    return this.sessionRecordRepository.query(query);
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
    return searchBlocksWithRuntime({
      db: this.db as any,
      enableEncryption: this.enableEncryption,
      useSQLCipher: this.useSQLCipher,
      getContentKey: () => this.getContentKey(),
      queryBlocks: (filter) => this.queryBlocks(filter),
      rowToBlock: (row) => this.rowToBlock(row),
    }, query, limit);
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
    return this.databaseStatsRepository.getStats();
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
    return this.databaseStatsRepository.getStatusBreakdown();
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
    return this.databaseStatsRepository.checkHealth();
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
    return this.databaseStatsRepository.getTUIStats();
  }

  upsertRawSession(input: RawSessionInput): RawSessionRecord {
    return this.rawMemoryRepository.upsertSession(input);
  }

  getRawSessionByKey(sessionKey: string): RawSessionRecord | null {
    const transcript = this.rawMemoryRepository.getTranscript(sessionKey);
    return transcript?.session ?? null;
  }

  listRawSessions(): RawSessionRecord[] {
    return this.rawMemoryRepository.listSessions();
  }

  upsertRawMessage(input: RawMessageInput): RawMessageRecord {
    return this.rawMemoryRepository.upsertMessage(input);
  }

  listRawMessages(sessionKey: string): RawMessageRecord[] {
    return this.rawMemoryRepository.listMessages(sessionKey);
  }

  getRawTranscript(sessionKey: string): RawTranscript | null {
    return this.rawMemoryRepository.getTranscript(sessionKey);
  }

  getHostImportCursor(host: HostId): string | null {
    return this.hostImportCursorStore.get(host);
  }

  setHostImportCursor(host: HostId, cursor: string): void {
    this.hostImportCursorStore.set(host, cursor);
  }

  ensureExtractSessionProcessingJob(input: EnsureExtractSessionJobInput): MemoryProcessingJobRecord {
    return this.memoryProcessingJobQueue.ensureExtractSessionJob(input);
  }

  listPendingMemoryProcessingJobs(): MemoryProcessingJobRecord[] {
    return this.memoryProcessingJobQueue.listPending();
  }

  claimNextMemoryProcessingJob(now = Date.now()): MemoryProcessingJobRecord | null {
    return this.memoryProcessingJobQueue.claimNext(now);
  }

  markMemoryProcessingJobSucceeded(id: string): void {
    this.memoryProcessingJobQueue.markSucceeded(id);
  }

  markMemoryProcessingJobFailed(id: string, error: string, nextAvailableAt?: number): void {
    this.memoryProcessingJobQueue.markFailed(id, error, nextAvailableAt);
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
    return mapRowToBlock({
      enableEncryption: this.enableEncryption,
      useSQLCipher: this.useSQLCipher,
      getContentKey: () => this.getContentKey(),
    }, row);
  }

  private rowToSessionRecord(row: unknown, messages: unknown[]): SessionRecord {
    return mapRowToSessionRecord(row as any, messages as any[]);
  }

  /**
   * Convert database rows to Association objects
   */
  private rowToAssociation(row: any): Association {
    return mapRowToAssociation(row);
  }

  private rowToRawSession(row: any): RawSessionRecord {
    return mapRowToRawSession(row);
  }

  private rowToRawMessage(row: any): RawMessageRecord {
    return mapRowToRawMessage(row);
  }

  private rowToMemoryProcessingJob(row: any): MemoryProcessingJobRecord {
    return mapRowToMemoryProcessingJob(row);
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
