import type { CorivoDatabase } from '../storage/database.js';
import type {
  RawMessageInput,
  RawMessageRecord,
  RawSessionInput,
  RawSessionRecord,
  RawTranscript,
} from './types.js';

export class RawMemoryRepository {
  constructor(private readonly db: CorivoDatabase) {}

  upsertSession(input: RawSessionInput): RawSessionRecord {
    return this.db.upsertRawSession(input);
  }

  upsertMessage(input: RawMessageInput): RawMessageRecord {
    return this.db.upsertRawMessage(input);
  }

  listMessages(sessionKey: string): RawMessageRecord[] {
    return this.db.listRawMessages(sessionKey);
  }

  getTranscript(sessionKey: string): RawTranscript | null {
    return this.db.getRawTranscript(sessionKey);
  }
}
