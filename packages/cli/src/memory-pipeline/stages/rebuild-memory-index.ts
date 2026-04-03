import type {
  ArtifactDescriptor,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import { setIndexRefreshMetadata } from '../pipeline-state.js';
import type { FinalMemoryBatchArtifact } from '../contracts/memory-documents.js';

const STAGE_ID = 'rebuild-memory-index';

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  readMemoryFile(relativePath: string): Promise<string>;
  listFinalMemoryFiles(kind?: 'detail' | 'index' | 'all'): Promise<string[]>;
}

export class RebuildMemoryIndexStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const indexFiles = await this.resolveIndexFiles(context, artifactStore);
    const indexes = await Promise.all(
      indexFiles.map(async (file) => ({
        path: file,
        content: await artifactStore.readMemoryFile(file),
      })),
    );

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'memory-index',
      source: this.id,
      body: JSON.stringify({ indexes }),
    });
    setIndexRefreshMetadata(context.state, {
      stageId: this.id,
      indexCount: indexes.length,
      artifactId: descriptor.id,
      refreshedAt: Date.now(),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: indexes.length,
      outputCount: indexes.length,
      artifactIds: [descriptor.id],
    };
  }

  private getMemoryStore(artifactStore: MemoryPipelineArtifactStore): MemoryRootArtifactStore {
    if (
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).readMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listFinalMemoryFiles !== 'function'
    ) {
      throw new Error('RebuildMemoryIndexStage requires an artifact store with memory file access');
    }

    return artifactStore as MemoryRootArtifactStore;
  }

  private async resolveIndexFiles(
    context: MemoryPipelineContext,
    artifactStore: MemoryRootArtifactStore,
  ): Promise<string[]> {
    const fromState = context.state.mergedFinalOutputs.files
      .filter((file) => file.endsWith('/MEMORY.md'))
      .map((file) => file.replace(/^memory\//, ''));

    if (fromState.length > 0) {
      return fromState;
    }

    const finalArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      kind: 'final-memory-batch',
      source: 'merge-final-memories',
    });

    const files = await this.readIndexFilesFromArtifacts(context, finalArtifacts);
    if (files.length > 0) {
      return [...new Set(files)];
    }

    return artifactStore.listFinalMemoryFiles('index');
  }

  private async readIndexFilesFromArtifacts(
    context: MemoryPipelineContext,
    artifacts: ArtifactDescriptor[],
  ): Promise<string[]> {
    const files: string[] = [];
    for (const artifact of artifacts) {
      const body = await context.artifactStore.readArtifact(artifact.id);
      const payload = JSON.parse(body) as Partial<FinalMemoryBatchArtifact>;
      if (!Array.isArray(payload.files)) {
        continue;
      }
      for (const file of payload.files) {
        if (typeof file === 'string' && file.endsWith('/MEMORY.md')) {
          files.push(file.replace(/^memory\//, ''));
        }
      }
    }
    return files;
  }
}
