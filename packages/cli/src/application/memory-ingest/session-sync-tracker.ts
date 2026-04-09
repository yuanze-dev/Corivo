import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SessionSyncTracker {
  readCheckpoint(sessionKey: string): Promise<string | undefined>;
  writeCheckpoint(sessionKey: string, checkpoint: string): Promise<void>;
}

export function createFileSessionSyncTracker(configDir: string): SessionSyncTracker {
  const trackerDir = path.join(configDir, 'session-sync-trackers');

  return {
    async readCheckpoint(sessionKey: string): Promise<string | undefined> {
      try {
        const value = await fs.readFile(path.join(trackerDir, `${hashSessionKey(sessionKey)}.txt`), 'utf8');
        return value.trim() || undefined;
      } catch {
        return undefined;
      }
    },

    async writeCheckpoint(sessionKey: string, checkpoint: string): Promise<void> {
      await fs.mkdir(trackerDir, { recursive: true });
      await fs.writeFile(
        path.join(trackerDir, `${hashSessionKey(sessionKey)}.txt`),
        `${checkpoint}\n`,
        'utf8',
      );
    },
  };
}

function hashSessionKey(sessionKey: string): string {
  return createHash('sha256').update(sessionKey).digest('hex').slice(0, 24);
}
