import { CorivoDatabase } from '@/infrastructure/storage/facade/database';

export interface OpenCorivoDatabaseOptions {
  path: string;
  key?: Buffer;
  enableEncryption?: boolean;
}

export function openCorivoDatabase(options: OpenCorivoDatabaseOptions): CorivoDatabase {
  return CorivoDatabase.getInstance(options);
}

export function closeCorivoDatabase(_db: CorivoDatabase): void {
  // No-op; the CorivoDatabase lifecycle is managed at the process level.
}

export { CorivoDatabase };
