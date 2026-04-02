import { MemoryProcessingJobQueue } from '@/raw-memory/job-queue';
import { RawMemoryRepository } from '@/raw-memory/repository';
import { type CorivoDatabase } from '@/storage/database';
import {
  DatabaseRawSessionJobSource,
  DatabaseRawSessionRecordSource,
  type ClaudeSessionSource,
  type RawSessionJobSource,
} from '@/memory-pipeline';

export function createDatabaseSessionSource(db: CorivoDatabase): ClaudeSessionSource {
  return new DatabaseRawSessionRecordSource({
    repository: {
      listRawSessions: () => db.listRawSessions(),
      getRawTranscript: (sessionKey) => db.getRawTranscript(sessionKey),
    },
  }) as ClaudeSessionSource;
}

export function createDatabaseRawSessionJobSource(db: CorivoDatabase): RawSessionJobSource {
  return new DatabaseRawSessionJobSource({
    queue: new MemoryProcessingJobQueue(db),
    repository: new RawMemoryRepository(db),
  });
}
