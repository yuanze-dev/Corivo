import type {
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'rebuild-memory-index';

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  readMemoryFile(relativePath: string): Promise<string>;
  listMemoryFiles(relativeDir?: string): Promise<string[]>;
}

export class RebuildMemoryIndexStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const indexFiles = (await artifactStore.listMemoryFiles('final'))
      .filter((file) => file.endsWith('/MEMORY.md'));
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
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listMemoryFiles !== 'function'
    ) {
      throw new Error('RebuildMemoryIndexStage requires an artifact store with memory root file access');
    }

    return artifactStore as MemoryRootArtifactStore;
  }
}
