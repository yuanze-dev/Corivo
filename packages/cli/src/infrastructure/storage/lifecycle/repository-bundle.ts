import { AssociationRepository } from '@/infrastructure/storage/repositories/association-repository.js';
import { BlockRepository } from '@/infrastructure/storage/repositories/block-repository.js';
import { DatabaseStatsRepository } from '@/infrastructure/storage/repositories/database-stats-repository.js';
import { HostImportCursorStore } from '@/infrastructure/storage/repositories/host-import-cursor-store.js';
import { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue.js';
import { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import { SessionRecordRepository } from '@/infrastructure/storage/repositories/session-record-repository.js';
import type {
  Association,
  Block,
} from '@/domain/memory/models/index.js';
import type {
  MemoryProcessingJobRecord,
  RawMessageRecord,
  RawSessionRecord,
} from '@/infrastructure/storage/types/raw-memory.js';
import type { SessionRecord } from '@/memory-pipeline/contracts/session-record.js';

interface RepositoryBundleSqliteDb {
  prepare(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  pragma(input: string, options?: { simple?: boolean }): unknown;
}

export interface CreateCorivoRepositoryBundleOptions {
  db: RepositoryBundleSqliteDb;
  path: string;
  enableEncryption: boolean;
  useSQLCipher: boolean;
  getContentKey: () => Buffer;
  rowToBlock: (row: unknown) => Block;
  rowToAssociation: (row: unknown) => Association;
  rowToRawSession: (row: unknown) => RawSessionRecord;
  rowToRawMessage: (row: unknown) => RawMessageRecord;
  rowToMemoryProcessingJob: (row: unknown) => MemoryProcessingJobRecord;
  rowToSessionRecord: (row: unknown, messages: unknown[]) => SessionRecord;
}

export function createCorivoRepositoryBundle(options: CreateCorivoRepositoryBundleOptions) {
  return {
    blockRepository: new BlockRepository({
      db: options.db,
      enableEncryption: options.enableEncryption,
      useSQLCipher: options.useSQLCipher,
      getContentKey: options.getContentKey,
      rowToBlock: options.rowToBlock,
    }),
    associationRepository: new AssociationRepository({
      db: options.db,
      rowToAssociation: options.rowToAssociation,
    }),
    rawMemoryRepository: new RawMemoryRepository({
      db: options.db,
      rowToRawSession: options.rowToRawSession,
      rowToRawMessage: options.rowToRawMessage,
    }),
    hostImportCursorStore: new HostImportCursorStore(options.db),
    memoryProcessingJobQueue: new MemoryProcessingJobQueue(
      options.db,
      options.rowToMemoryProcessingJob,
    ),
    databaseStatsRepository: new DatabaseStatsRepository({
      db: options.db,
      path: options.path,
      enableEncryption: options.enableEncryption,
      useSQLCipher: options.useSQLCipher,
      getContentKey: options.getContentKey,
      rowToBlock: options.rowToBlock,
    }),
    sessionRecordRepository: new SessionRecordRepository({
      db: options.db,
      rowToSessionRecord: options.rowToSessionRecord,
    }),
  };
}
