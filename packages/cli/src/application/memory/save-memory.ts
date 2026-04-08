import fs from 'node:fs/promises';
import path from 'node:path';
import type { CorivoConfig } from '@/config.js';
import { loadConfig } from '@/config.js';
import { ConfigError, ValidationError } from '@/errors/index.js';
import { validateAnnotation, type Block } from '@/domain/memory/models/block.js';
import { resolveMemoryProvider } from '@/domain/memory/providers/resolve-memory-provider.js';
import type { MemoryProvider, MemoryProviderName } from '@/domain/memory/providers/types.js';
import { getConfigDir } from '@/infrastructure/storage/lifecycle/database-paths.js';
import type { ConflictReminder } from '@/domain/memory/services/conflict-detector.js';

const LEGACY_CONFIG_ERROR =
  'Detected a legacy password-based config. Corivo v0.10+ no longer supports passwords here; please run: corivo init';

export interface SaveMemoryInput {
  content?: string;
  annotation?: string;
  source?: string;
  pending?: boolean;
}

export interface SaveMemoryResult {
  ok: boolean;
  provider: MemoryProviderName;
  /**
   * Provider/native id. For remote providers this is the authoritative id.
   * For local saves this is the local block id.
   */
  id?: string;
  content: string;
  annotation: string;
  source: string;
  warnings: {
    pendingFallback: boolean;
  };
  /**
   * Local-only fields. Do not assume these exist for remote providers.
   */
  local?: {
    id: string;
    vitality: number;
    status: Block['status'];
  };
  conflictReminder?: ConflictReminder | null;
}

export interface SaveMemoryUseCaseDependencies {
  loadConfig?: () => Promise<CorivoConfig | null>;
  resolveProvider?: (config?: CorivoConfig | null) => MemoryProvider;
}

export function createSaveMemoryUseCase(deps: SaveMemoryUseCaseDependencies = {}) {
  const load = deps.loadConfig ?? (() => loadConfig());
  const resolveProvider = deps.resolveProvider ?? ((config?: CorivoConfig | null) => resolveMemoryProvider(config));

  return async (input: SaveMemoryInput): Promise<SaveMemoryResult> => {
    const config = await loadProviderConfigOrThrow(load);

    if ((config as { encrypted_db_key?: unknown }).encrypted_db_key) {
      throw new ConfigError(LEGACY_CONFIG_ERROR);
    }

    if (!input.content || input.content.trim().length === 0) {
      throw new ValidationError('Missing --content argument');
    }

    const source = input.source || 'cli';
    const userAnnotation = (input.annotation ?? '').trim();
    const forcePending = Boolean(input.pending);
    const fallbackToPending = !forcePending && userAnnotation.length === 0;
    const annotation = forcePending ? 'pending' : (userAnnotation.length > 0 ? userAnnotation : 'pending');

    if (annotation && annotation !== 'pending' && !validateAnnotation(annotation)) {
      throw new ValidationError(
        'Invalid annotation format. Expected "type · domain · tag", for example: "Decision · project · corivo"',
      );
    }

    const provider = resolveProvider(config);

    const result = await provider.save({
      content: input.content,
      annotation,
      source,
    });

    if (!result.ok) {
      throw new Error(result.error || 'Failed to save memory via provider.');
    }

    const local = result.local;
    const conflictReminder: ConflictReminder | null | undefined = result.conflictReminder;

    return {
      ok: true,
      provider: provider.provider,
      id: result.id,
      content: input.content,
      annotation,
      source,
      warnings: { pendingFallback: fallbackToPending },
      local,
      conflictReminder,
    };
  };
}

async function loadProviderConfigOrThrow(load: () => Promise<CorivoConfig | null>) {
  const config = await load();
  if (config) {
    return config;
  }

  const configPath = path.join(getConfigDir(), 'config.json');
  try {
    await fs.access(configPath);
  } catch {
    throw new ConfigError('Corivo is not initialized. Please run: corivo init');
  }

  throw new ConfigError('Corivo config is invalid. Please re-run: corivo init');
}
