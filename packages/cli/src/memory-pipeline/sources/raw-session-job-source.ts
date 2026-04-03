import type { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue.js';
import type { RawMemoryRepository } from '@/infrastructure/storage/repositories/raw-memory-repository.js';
import type {
  MemoryProcessingJobRecord,
  RawMessageRecord,
  RawSessionRecord,
} from '../../raw-memory/types.js';
import type { WorkItem } from '../types.js';

const TRANSCRIPT_RETRY_DELAY_MS = 5_000;

export type SessionJobWorkItem = WorkItem & {
  kind: 'session-job';
  job: MemoryProcessingJobRecord;
  host: MemoryProcessingJobRecord['host'];
  sessionKey: string;
  session: RawSessionRecord;
  transcript: RawMessageRecord[];
};

export interface RawSessionJobSource {
  collect(limit?: number): Promise<SessionJobWorkItem[]>;
  markSucceeded(jobId: string): Promise<void>;
  markFailed(jobId: string, error: string, nextAvailableAt?: number): Promise<void>;
}

export interface DatabaseRawSessionJobSourceConfig {
  queue: Pick<MemoryProcessingJobQueue, 'claimNext' | 'markSucceeded' | 'markFailed'>;
  repository: Pick<RawMemoryRepository, 'getTranscript'>;
}

export class DatabaseRawSessionJobSource implements RawSessionJobSource {
  constructor(private readonly config: DatabaseRawSessionJobSourceConfig) {}

  async collect(limit = 20): Promise<SessionJobWorkItem[]> {
    const batchSize = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const items: SessionJobWorkItem[] = [];

    for (let index = 0; index < batchSize; index += 1) {
      let job: MemoryProcessingJobRecord | null;
      try {
        job = await Promise.resolve(this.config.queue.claimNext());
      } catch {
        break;
      }

      if (!job) {
        break;
      }

      try {
        const transcript = await Promise.resolve(this.config.repository.getTranscript(job.sessionKey));

        if (!transcript) {
          const requeued = await this.requeueClaimedJob(
            job,
            `Raw transcript not found for session ${job.sessionKey}`,
          );
          if (!requeued) {
            break;
          }
          continue;
        }

        items.push({
          id: job.id,
          kind: 'session-job',
          sourceRef: job.sessionKey,
          freshnessToken: String(transcript.session.updatedAt),
          job,
          host: job.host,
          sessionKey: job.sessionKey,
          session: transcript.session,
          transcript: transcript.messages,
        });
      } catch (error) {
        const requeued = await this.requeueClaimedJob(
          job.id,
          error instanceof Error ? error.message : `Transcript load failed for ${job.sessionKey}`,
        );
        if (!requeued) {
          break;
        }
        continue;
      }
    }

    return items;
  }

  private async requeueClaimedJob(
    job: Pick<MemoryProcessingJobRecord, 'id' | 'sessionKey'> | string,
    error: string,
  ): Promise<boolean> {
    const jobId = typeof job === 'string' ? job : job.id;

    try {
      await this.markFailed(
        jobId,
        error,
        Date.now() + TRANSCRIPT_RETRY_DELAY_MS,
      );
      return true;
    } catch {
      return false;
    }
  }

  async markSucceeded(jobId: string): Promise<void> {
    await Promise.resolve(this.config.queue.markSucceeded(jobId));
  }

  async markFailed(jobId: string, error: string, nextAvailableAt?: number): Promise<void> {
    await Promise.resolve(this.config.queue.markFailed(jobId, error, nextAvailableAt));
  }
}
