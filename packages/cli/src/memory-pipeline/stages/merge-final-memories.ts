import type {
  FinalMemoryBatchArtifact,
  FinalMemoryFileBlock,
  ModelProcessor,
  RawMemoryBatchArtifact,
  RawMemoryDocument,
} from '@/memory-pipeline';
import {
  buildFinalMergePrompt,
  materializeRawMemoryDocuments,
  parseFinalMemoryFileBlocks,
  parseRawMemoryDocument,
  renderFinalMemoryDocument,
  renderRawMemoryDocument,
  renderMemoryIndex,
  validateFinalMemoryFileBlocks,
} from '@/memory-pipeline';
import { setMergedFinalOutputs } from '../pipeline-state.js';
import type {
  ArtifactDescriptor,
  MemoryPipelineArtifactStore,
  MemoryPipelineContext,
  MemoryPipelineStage,
  PipelineStageResult,
} from '../types.js';

const STAGE_ID = 'merge-final-memories';
const RAW_STAGE_ID = 'extract-raw-memories';
const MERGE_TIMEOUT_MS = 180_000;
const LEGACY_RAW_FILE_BLOCK_PATTERN =
  /<!--\s*FILE:\s*([^\s].*?)\s*-->\s*```markdown\s*[\s\S]*?```/g;

interface MemoryRootArtifactStore extends MemoryPipelineArtifactStore {
  writeMemoryFile(relativePath: string, body: string): Promise<string>;
  readMemoryFile(relativePath: string): Promise<string>;
  listMemoryFiles(relativeDir?: string): Promise<string[]>;
}

interface ParsedRawBatch {
  sessionId: string;
  items: RawMemoryBatchArtifact['items'];
  documents?: RawMemoryDocument[];
}

export interface MergeFinalMemoriesStageOptions {
  processor: ModelProcessor;
}

export class MergeFinalMemoriesStage implements MemoryPipelineStage {
  readonly id = STAGE_ID;
  private readonly processor: ModelProcessor;

  constructor(options: MergeFinalMemoriesStageOptions) {
    if (!options?.processor || typeof options.processor.process !== 'function') {
      throw new Error('MergeFinalMemoriesStage requires a ModelProcessor capability');
    }
    this.processor = options.processor;
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
      }))
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
      rawBatches
        .filter(({ batch }) => batch.items.length > 0)
        .map(async ({ batch }) => {
          const relativePath = `raw/${batch.sessionId}.memories.md`;
          const rawDocuments = batch.documents ?? materializeRawMemoryDocuments(batch.items);
          const content = rawDocuments.map((document) => renderRawMemoryDocument(document)).join('\n\n');
          await artifactStore.writeMemoryFile(relativePath, content);
          return this.renderPromptInputFile(relativePath, content);
        })
    );

    if (rawFiles.length === 0) {
      return {
        stageId: this.id,
        status: 'success',
        inputCount: rawArtifacts.length,
        outputCount: 0,
        artifactIds: [],
      };
    }

    const existingFinalPaths = await artifactStore.listMemoryFiles('final');
    const existingFinalFiles = await Promise.all(
      existingFinalPaths.map(async (relativePath) =>
        this.renderPromptInputFile(relativePath, await artifactStore.readMemoryFile(relativePath))
      )
    );

    const existingFinalDetailPaths = existingFinalPaths.filter(
      (relativePath) => !relativePath.endsWith('/MEMORY.md')
    );
    const rawDocuments = rawBatches.flatMap(({ batch }) =>
      materializeRawMemoryDocuments(batch.items)
    );

    if (existingFinalDetailPaths.length === 0 && rawFiles.length === 1) {
      const files = this.buildDeterministicFinalFiles(rawDocuments);
      return await this.persistFinalFiles(context, rawArtifacts, files);
    }

    const prompt = buildFinalMergePrompt({
      rawFiles,
      existingFinalFiles,
    });
    context.logger?.debug?.(
      `[memory:pipeline:merge-final-memories] prompt diagnostics rawFileCount=${rawFiles.length} existingFinalFileCount=${existingFinalFiles.length} promptLength=${prompt.length}`,
    );
    const result = await this.processor.process([prompt], { timeoutMs: MERGE_TIMEOUT_MS });
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

    let files: FinalMemoryFileBlock[];
    try {
      files = validateFinalMemoryFileBlocks(parseFinalMemoryFileBlocks(output));
    } catch (error) {
      if (
        rawDocuments.length > 0 &&
        error instanceof Error &&
        error.message ===
          'Malformed final memory output: expected FILE comments followed by fenced markdown blocks.'
      ) {
        files = this.buildDeterministicFinalFiles(rawDocuments);
      } else {
        throw error;
      }
    }
    return await this.persistFinalFiles(context, rawArtifacts, files);
  }

  private getMemoryStore(artifactStore: MemoryPipelineArtifactStore): MemoryRootArtifactStore {
    if (
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).writeMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).readMemoryFile !== 'function' ||
      typeof (artifactStore as Partial<MemoryRootArtifactStore>).listMemoryFiles !== 'function'
    ) {
      throw new Error(
        'MergeFinalMemoriesStage requires an artifact store with memory root file access'
      );
    }

    return artifactStore as MemoryRootArtifactStore;
  }

  private async readRawBatch(
    context: MemoryPipelineContext,
    artifact: ArtifactDescriptor
  ): Promise<ParsedRawBatch> {
    const body = await context.artifactStore.readArtifact(artifact.id);
    const parsed = JSON.parse(body) as Partial<RawMemoryBatchArtifact> & { markdown?: string };

    if (typeof parsed.sessionId !== 'string' || parsed.sessionId.trim().length === 0) {
      throw new Error(
        'MergeFinalMemoriesStage requires raw-memory-batch artifacts with sessionId and items'
      );
    }

    if (Array.isArray(parsed.items)) {
      return {
        sessionId: parsed.sessionId,
        items: parsed.items,
      };
    }

    if (typeof parsed.markdown === 'string') {
      const document = parseRawMemoryDocument(parsed.markdown);
      return {
        sessionId: parsed.sessionId,
        items: document.items,
        documents: document.documents ?? recoverLegacyRawDocuments(parsed.markdown, document.items),
      };
    }

    throw new Error(
      'MergeFinalMemoriesStage requires raw-memory-batch artifacts with sessionId and items',
    );
  }

  private renderPromptInputFile(relativePath: string, content: string): string {
    return [`FILE: memories/${relativePath}`, content].join('\n');
  }

  private buildDeterministicFinalFiles(rawDocuments: RawMemoryDocument[]): FinalMemoryFileBlock[] {
    const finalFiles: FinalMemoryFileBlock[] = rawDocuments.map((document) => ({
      filePath: `final/${document.filePath}`,
      content: renderFinalMemoryDocument({
        filePath: `final/${document.filePath}`,
        frontmatter: {
          name: document.frontmatter.name,
          description: document.frontmatter.description,
          type: document.frontmatter.type,
          scope: document.frontmatter.scope,
          merged_from: [document.frontmatter.source_session.replace(/\.md$/, '')],
        },
        body: document.body,
      }),
    }));

    const privateEntries = rawDocuments
      .filter((document) => document.frontmatter.scope === 'private')
      .map((document) => ({
        title: document.frontmatter.name,
        filename: document.filePath.split('/').pop() ?? document.filePath,
        hook: document.frontmatter.description,
      }));
    const teamEntries = rawDocuments
      .filter((document) => document.frontmatter.scope === 'team')
      .map((document) => ({
        title: document.frontmatter.name,
        filename: document.filePath.split('/').pop() ?? document.filePath,
        hook: document.frontmatter.description,
      }));

    finalFiles.push({
      filePath: 'final/private/MEMORY.md',
      content: renderMemoryIndex(privateEntries),
    });
    finalFiles.push({
      filePath: 'final/team/MEMORY.md',
      content: renderMemoryIndex(teamEntries),
    });

    return validateFinalMemoryFileBlocks(finalFiles);
  }

  private async persistFinalFiles(
    context: MemoryPipelineContext,
    rawArtifacts: ArtifactDescriptor[],
    files: FinalMemoryFileBlock[]
  ): Promise<PipelineStageResult> {
    const artifactStore = this.getMemoryStore(context.artifactStore);
    const writtenFiles = await Promise.all(
      files.map((file) => artifactStore.writeMemoryFile(file.filePath, file.content))
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
    setMergedFinalOutputs(context.state, {
      files: writtenFiles.map((relativePath) => `memory/${relativePath}`),
      artifactId: descriptor.id,
    });

    return {
      stageId: this.id,
      status: 'success',
      inputCount: rawArtifacts.length,
      outputCount: files.length,
      artifactIds: [descriptor.id],
    };
  }

  private getProcessorFailure(
    result: Awaited<ReturnType<ModelProcessor['process']>>
  ): string | null {
    if (
      result.outputs.length === 0 &&
      (result.metadata?.status === 'error' || result.metadata?.status === 'timeout')
    ) {
      return formatProcessorFailure(result.metadata);
    }

    return null;
  }
}

function formatProcessorFailure(
  metadata: NonNullable<Awaited<ReturnType<ModelProcessor['process']>>['metadata']>,
): string {
  const base = metadata.error ?? `final merge ${metadata.status}`;
  const diagnostics: string[] = [];

  if (metadata.provider) {
    diagnostics.push(`provider=${metadata.provider}`);
  }

  if (metadata.diagnostics?.timeoutMs !== undefined) {
    diagnostics.push(`timeoutMs=${metadata.diagnostics.timeoutMs}`);
  }

  if (metadata.diagnostics?.exitCode !== undefined) {
    diagnostics.push(`exitCode=${metadata.diagnostics.exitCode}`);
  }

  if (metadata.diagnostics?.stderr) {
    diagnostics.push(`stderr=${singleLine(metadata.diagnostics.stderr)}`);
  }

  if (metadata.diagnostics?.stdout) {
    diagnostics.push(`stdout=${singleLine(metadata.diagnostics.stdout)}`);
  }

  return diagnostics.length > 0 ? `${base} (${diagnostics.join(', ')})` : base;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function recoverLegacyRawDocuments(
  markdown: string,
  items: RawMemoryBatchArtifact['items'],
): RawMemoryDocument[] | undefined {
  const filePaths = Array.from(markdown.matchAll(LEGACY_RAW_FILE_BLOCK_PATTERN)).map((match) =>
    match[1]?.trim(),
  ).filter((filePath): filePath is string => Boolean(filePath));

  if (filePaths.length !== items.length || filePaths.length === 0) {
    return undefined;
  }

  return items.map((item, index) => ({
    filePath: filePaths[index],
    frontmatter: item.frontmatter,
    body: item.body,
  }));
}
