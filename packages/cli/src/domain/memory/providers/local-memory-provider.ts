import { createQueryPack } from '@/application/query/query-pack.js';
import { generateRecall } from '@/application/query/generate-recall.js';
import { generateRawTranscriptRecall } from '@/application/query/generate-raw-recall.js';
import { loadMemoryIndex } from '@/runtime/memory-index.js';
import { loadRuntimeDb } from '@/runtime/runtime-support.js';
import { MemoryProviderUnavailableError, type MemoryProvider } from './types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/infrastructure/storage/facade/database';
import { detectConflictReminder } from '@/runtime/conflict-detection.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidConfigForLocalProvider(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) {
    return false;
  }
  const candidate = config as any;

  if (!isNonEmptyString(candidate.version) || !isNonEmptyString(candidate.created_at) || !isNonEmptyString(candidate.identity_id)) {
    return false;
  }

  if (candidate.encrypted_db_key) {
    return false;
  }

  if (typeof candidate.memoryEngine === 'undefined') {
    return true;
  }

  const provider = candidate.memoryEngine?.provider;
  if (provider === 'local') {
    return true;
  }
  // Remote-only config: local provider is not considered healthy/available.
  if (provider === 'supermemory') {
    return false;
  }

  return false;
}

export function createLocalMemoryProvider(): MemoryProvider {
  return {
    provider: 'local',

    async save(input) {
      const dbPath = getDefaultDatabasePath();
      const db = CorivoDatabase.getInstance({ path: dbPath, enableEncryption: false });
      const block = db.createBlock({
        content: input.content,
        annotation: input.annotation,
        source: input.source ?? 'cli',
      });

      const existingBlocks = db.queryBlocks({ limit: 50 });
      const conflictReminder = detectConflictReminder(input.content, existingBlocks);

      return {
        ok: true,
        provider: 'local',
        id: block.id,
        local: {
          id: block.id,
          vitality: block.vitality,
          status: block.status,
        },
        conflictReminder,
      };
    },

    async search(input) {
      const { query, limit, db } = input;
      if (!db) {
        throw new MemoryProviderUnavailableError('Local runtime DB is unavailable.');
      }
      return db.searchBlocks(query, limit);
    },

    async recall(input) {
      const { prompt, db } = input;
      if (!prompt) {
        return null;
      }
      if (!db) {
        throw new MemoryProviderUnavailableError('Local runtime DB is unavailable.');
      }

      const queryPack = createQueryPack({ prompt });
      const memoryIndex = await loadMemoryIndex();
      const recall =
        generateRecall(db, queryPack, { memoryIndex })
        ?? await generateRawTranscriptRecall(db, queryPack);

      return recall;
    },

    async healthcheck() {
      const configPath = path.join(getConfigDir(), 'config.json');
      let raw: string;
      try {
        raw = await fs.readFile(configPath, 'utf8');
      } catch {
        return { ok: false, provider: 'local', message: 'Local config/DB is not initialized.' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        return { ok: false, provider: 'local', message: 'Local config is invalid.' };
      }

      const engineProvider = (parsed as any)?.memoryEngine?.provider as unknown;
      if (engineProvider === 'supermemory') {
        return {
          ok: false,
          provider: 'local',
          message: 'Local provider is disabled because memoryEngine.provider is set to supermemory.',
        };
      }

      if (!isValidConfigForLocalProvider(parsed)) {
        return { ok: false, provider: 'local', message: 'Local config is invalid.' };
      }

      try {
        const db = await loadRuntimeDb({ password: false });
        if (!db) {
          return { ok: false, provider: 'local', message: 'Local DB is unavailable.' };
        }
        return { ok: true, provider: 'local' };
      } catch (error) {
        return {
          ok: false,
          provider: 'local',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
