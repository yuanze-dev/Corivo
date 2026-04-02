import path from 'node:path';
import { CorivoDatabase } from '@/storage/database';
import {
  ArtifactStore,
  FileRunLock,
  MemoryPipelineRunner,
  type MemoryPipelineArtifactStore,
} from '@/memory-pipeline';
import type { Logger } from '@/utils/logging';

export function getMemoryPipelineRunRoot(configDir: string): string {
  return path.join(configDir, 'memory-pipeline');
}

export function createMemoryPipelineArtifactStore(runRoot: string): MemoryPipelineArtifactStore {
  return new ArtifactStore(runRoot);
}

export function createMemoryPipelineLock(runRoot: string): FileRunLock {
  return new FileRunLock(path.join(runRoot, 'run.lock'));
}

export function createMemoryPipelineRunner(options: {
  artifactStore: MemoryPipelineArtifactStore;
  lock: FileRunLock;
  logger: Logger;
  runRoot: string;
}) {
  return new MemoryPipelineRunner(options);
}

export function openMemoryPipelineDatabase(dbPath: string): CorivoDatabase {
  return CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false });
}

export function closeMemoryPipelineDatabase(): void {
  // No-op; the CorivoDatabase lifecycle is managed at the process level.
}
