import { buildFinalMergePrompt } from '../prompts/final-merge-prompt.js';
import type { ModelProcessor } from '../processors/model-processor.js';
import { ExtractionBackedModelProcessor } from '../processors/model-processor.js';
import { parseFinalMemoryFileBlocks, validateFinalMemoryFileBlocks } from '../markdown/memory-writer.js';
import type { ExtractionProvider } from '../../extraction/types.js';
import type {
  FinalMemoryBatchArtifact,
  RawMemoryBatchArtifact,
} from '../contracts/memory-documents.js';
import type {
  ArtifactDescriptor,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'merge-final-memories';
const RAW_STAGE_ID = 'extract-raw-memories';

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  writeMemoryFile(relativePath: string, body: string): Promise<string>;
  readMemoryFile(relativePath: string): Promise<string>;
  listMemoryFiles(relativeDir?: string): Promise<string[]>;
}

export interface MergeFinalMemoriesStageOptions {
  processor?: ModelProcessor;
  provider?: ExtractionProvider;
}

export class MergeFinalMemoriesStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;

  constructor(options: MergeFinalMemoriesStageOptions = {}) {
    this.processor = options.processor ?? new ExtractionBackedModelProcessor({ provider: options.provider ?? 'claude' });
  }

  async run(context: MemoryPipelineContext): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const rawArtifacts = await context.artifactStore.listArtifacts({
      runId: context.runId,
      kind: 'raw-memory-batch',
      source: RAW_STAGE_ID,
    });

    const rawBatches = await Promise.all(
      rawArtifacts.map(async (artifact) => ({
        artifact,
        batch: await this.readRawBatch(context, artifact),
      })),
    );

    if (rawBatches.length === 0) {
      return {
        stageId: this.id,
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        artifactIds: [],
      };
    }

    const rawFiles = await Promise.all(
      rawBatches.map(async ({ batch }) => {
        const relativePath = `raw/${batch.sessionId}.memories.md`;
        await artifactStore.writeMemoryFile(relativePath, batch.markdown);
        return this.renderPromptInputFile(relativePath, batch.markdown);
      }),
    );

    const existingFinalPaths = await artifactStore.listMemoryFiles('final');
    const existingFinalFiles = await Promise.all(
      existingFinalPaths.map(async (relativePath) =>
        this.renderPromptInputFile(relativePath, await artifactStore.readMemoryFile(relativePath)),
      ),
    );

    const prompt = buildFinalMergePrompt({
      rawFiles,
      existingFinalFiles,
    });
    const result = await this.processor.process([prompt]);
    const failure = this.getProcessorFailure(result);
    if (failure) {
      return {
        stageId: this.id,
        status: 'failed',
        inputCount: rawArtifacts.length,
        outputCount: 0,
        artifactIds: [],
        error: failure,
      };
    }

    const output = result.outputs.find((item) => item.trim().length > 0);
    if (!output) {
      return {
        stageId: this.id,
        status: 'failed',
        inputCount: rawArtifacts.length,
        outputCount: 0,
        artifactIds: [],
        error: 'final merge produced no output',
      };
    }

    const files = validateFinalMemoryFileBlocks(parseFinalMemoryFileBlocks(output));
    const writtenFiles = await Promise.all(
      files.map((file) => artifactStore.writeMemoryFile(file.filePath, file.content)),
    );

    const descriptor = await context.artifactStore.writeArtifact({
      runId: context.runId,
      kind: 'final-memory-batch',
      source: this.id,
      upstreamIds: rawArtifacts.map((artifact) => artifact.id),
      body: JSON.stringify({
        files: writtenFiles.map((relativePath) => `memory/${relativePath}`),
      } satisfies FinalMemoryBatchArtifact),
    });

    return {
      stageId: this.id,
      status: 'success',
      inputCount: rawArtifacts.length,
      outputCount: files.length,
      artifactIds: [descriptor.id],
    };
  }

  private getMemoryStore(artifactStore: MemoryPipelineArtifactStore): MemoryRootArtifactStore {
    if (
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).writeMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).readMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listMemoryFiles !== 'function'
    ) {
      throw new Error('MergeFinalMemoriesStage requires an artifact store with memory root file access');
    }

    return artifactStore as MemoryRootArtifactStore;
  }

  private async readRawBatch(
    context: MemoryPipelineContext,
    artifact: ArtifactDescriptor,
  ): Promise<RawMemoryBatchArtifact> {
    const body = await context.artifactStore.readArtifact(artifact.id);
    const parsed = JSON.parse(body) as Partial<RawMemoryBatchArtifact>;

    if (
      typeof parsed.sessionId !== 'string' ||
      parsed.sessionId.trim().length === 0 ||
      typeof parsed.markdown !== 'string'
    ) {
      throw new Error('MergeFinalMemoriesStage requires raw-memory-batch artifacts with sessionId and markdown');
    }

    return {
      sessionId: parsed.sessionId,
      markdown: parsed.markdown,
    };
  }

  private renderPromptInputFile(relativePath: string, content: string): string {
    return [`FILE: memories/${relativePath}`, content].join('\n');
  }

  private getProcessorFailure(result: Awaited<ReturnType<ModelProcessor['process']>>): string | null {
    if (
      result.outputs.length === 0 &&
      (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
    ) {
      return result.metadata.error ?? `final merge ${result.metadata.status}`;
    }

    return null;
  }
}
