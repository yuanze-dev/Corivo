import { createHash } from 'node:crypto';
import type { MemoryProvider } from '@/domain/memory/providers/types.js';
import type {
  ArtifactDescriptor,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'sync-provider-memories';
const DETAIL_BODY_PATTERN = /^\s*---[\s\S]*?\n---\s*([\s\S]*)$/;

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  readMemoryFile(relativePath: string): Promise<string>;
  listFinalMemoryFiles(kind?: 'detail' | 'index' | 'all'): Promise<string[]>;
}

export interface SyncProviderMemoriesStageOptions {
  provider: MemoryProvider;
  projectTag: string;
}

export function createSyncProviderMemoriesStage(
  options: SyncProviderMemoriesStageOptions,
): MemoryPipelineStage {
  if (!options?.provider || typeof options.provider.save !== 'function') {
    throw new Error('SyncProviderMemoriesStage requires a memory provider');
  }
  if (!options.projectTag || options.projectTag.trim().length === 0) {
    throw new Error('SyncProviderMemoriesStage requires a projectTag');
  }

  const { provider, projectTag } = options;

  return {
    id: STAGE_ID,
    async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
      const artifactStore = getMemoryStore(context.artifactStore);
      const files = await artifactStore.listFinalMemoryFiles('detail');

      if (files.length === 0) {
        return {
          stageId: STAGE_ID,
          status: 'success',
          inputCount: 0,
          outputCount: 0,
          artifactIds: [],
        };
      }

      const failures: string[] = [];
      const synced: string[] = [];

      for (const file of files) {
        const raw = await artifactStore.readMemoryFile(file);
        const content = extractBody(raw);
        if (!content) {
          continue;
        }

        try {
          await provider.save({
            content,
            annotation: 'pending',
            source: 'memory-pipeline',
            customId: buildCustomId(projectTag, content),
          });
          synced.push(file);
        } catch (error) {
          failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const descriptor = await context.artifactStore.writeArtifact({
        runId: context.runId,
        kind: 'provider-sync-batch',
        source: STAGE_ID,
        body: JSON.stringify({
          provider: provider.provider,
          projectTag,
          synced,
          failures,
        }),
      });

      return {
        stageId: STAGE_ID,
        status: failures.length === 0 ? 'success' : synced.length > 0 ? 'partial' : 'failed',
        inputCount: files.length,
        outputCount: synced.length,
        artifactIds: [descriptor.id],
        ...(failures.length > 0 ? { error: failures.join('; ') } : {}),
      };
    },
  };
}

function getMemoryStore(artifactStore: MemoryPipelineArtifactStore): MemoryRootArtifactStore {
  if (
    typeof (artifactStore as Partial<MemoryRootArtifactStore>).readMemoryFile !== 'function' ||
    typeof (artifactStore as Partial<MemoryRootArtifactStore>).listFinalMemoryFiles !== 'function'
  ) {
    throw new Error('SyncProviderMemoriesStage requires an artifact store with final memory access');
  }

  return artifactStore as MemoryRootArtifactStore;
}

function extractBody(raw: string): string {
  const trimmed = raw.trim();
  const match = DETAIL_BODY_PATTERN.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

function buildCustomId(projectTag: string, content: string): string {
  const normalized = normalizeContent(content);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `corivo:${projectTag}:${hash}`;
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

export const SyncProviderMemoriesStage = createSyncProviderMemoriesStage;
