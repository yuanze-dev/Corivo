import type {
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'append-detail-records';

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  readMemoryFile(relativePath: string): Promise<string>;
  listMemoryFiles(relativeDir?: string): Promise<string[]>;
}

export class AppendDetailRecordsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const detailFiles = (await artifactStore.listMemoryFiles('final'))
      .filter((file) => file.endsWith('.md'))
      .filter((file) => !file.endsWith('/MEMORY.md'));
    const files = await Promise.all(
      detailFiles.map(async (file) => ({
        path: file,
        content: await artifactStore.readMemoryFile(file),
      })),
    );
    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'detail-record',
      source: this.id,
      body: JSON.stringify({ files }),
    });

    return {
      stageId: STAGE_ID,
      status: 'success',
      inputCount: files.length,
      outputCount: files.length,
      artifactIds: [descriptor.id],
    };
  }

  private getMemoryStore(artifactStore: MemoryPipelineArtifactStore): MemoryRootArtifactStore {
    if (
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).readMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listMemoryFiles !== 'function'
    ) {
      throw new Error('AppendDetailRecordsStage requires an artifact store with memory root file access');
    }

    return artifactStore as MemoryRootArtifactStore;
  }
}
