import type {
  ArtifactDescriptor,
  FinalMemoryFileKind,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';
import type { FinalMemoryBatchArtifact } from '../contracts/memory-documents.js';

const STAGE_ID = 'append-detail-records';
const MERGE_FINAL_STAGE_ID = 'merge-final-memories';

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  readMemoryFile(relativePath: string): Promise<string>;
  listFinalMemoryFiles(kind?: FinalMemoryFileKind): Promise<string[]>;
}

export class AppendDetailRecordsStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const detailFiles = await this.resolveDetailFiles(context, artifactStore);
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
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listFinalMemoryFiles !== 'function'
    ) {
      throw new Error('AppendDetailRecordsStage requires an artifact store with memory root file access');
    }

    return artifactStore as MemoryRootArtifactStore;
  }

  private async resolveDetailFiles(
    context: MemoryPipelineContext,
    artifactStore: MemoryRootArtifactStore,
  ): Promise<string[]> {
    const fromState = context.state.mergedFinalOutputs.files
      .filter((file) => file.endsWith('.md') && !file.endsWith('/MEMORY.md'))
      .map((file) => file.replace(/^memory\//, ''));

    if (fromState.length > 0) {
      return [...new Set(fromState)];
    }

    const finalArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      kind: 'final-memory-batch',
      source: MERGE_FINAL_STAGE_ID,
    });

    const fromArtifacts = await this.readDetailFilesFromArtifacts(context, finalArtifacts);
    if (fromArtifacts.length > 0) {
      return [...new Set(fromArtifacts)];
    }

    return artifactStore.listFinalMemoryFiles('detail');
  }

  private async readDetailFilesFromArtifacts(
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
        if (typeof file === 'string' && file.endsWith('.md') && !file.endsWith('/MEMORY.md')) {
          files.push(file.replace(/^memory\//, ''));
        }
      }
    }
    return files;
  }
}
