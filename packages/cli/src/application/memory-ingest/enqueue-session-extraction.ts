import type { HostId } from '@/domain/host/contracts/types.js';
import { MemoryProcessingJobQueue } from '@/infrastructure/storage/repositories/memory-processing-job-queue.js';
import type { MemoryProcessingJobRecord } from '../../raw-memory/types.js';

export interface EnqueueSessionExtractionRequest {
  host: HostId;
  sessionKey: string;
  availableAt?: number;
  priority?: number;
}

export interface EnqueueSessionExtractionDeps {
  queue: Pick<MemoryProcessingJobQueue, 'ensureExtractSessionJob'>;
}

export function createEnqueueSessionExtractionUseCase(
  deps: EnqueueSessionExtractionDeps,
) {
  return (
    input: EnqueueSessionExtractionRequest,
  ): MemoryProcessingJobRecord => deps.queue.ensureExtractSessionJob(input);
}
