import type { CorivoDatabase } from '@/storage/database';
import type {
  EnsureExtractSessionJobInput,
  MemoryProcessingJobRecord,
} from '@/raw-memory/types.js';

export class MemoryProcessingJobQueue {
  constructor(private readonly db: CorivoDatabase) {}

  ensureExtractSessionJob(input: EnsureExtractSessionJobInput): MemoryProcessingJobRecord {
    return this.db.ensureExtractSessionProcessingJob(input);
  }

  claimNext(now = Date.now()): MemoryProcessingJobRecord | null {
    return this.db.claimNextMemoryProcessingJob(now);
  }

  listPending(): MemoryProcessingJobRecord[] {
    return this.db.listPendingMemoryProcessingJobs();
  }

  markSucceeded(id: string): void {
    this.db.markMemoryProcessingJobSucceeded(id);
  }

  markFailed(id: string, error: string, nextAvailableAt?: number): void {
    this.db.markMemoryProcessingJobFailed(id, error, nextAvailableAt);
  }
}
