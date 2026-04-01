import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ArtifactDescriptor, ArtifactWriteInput, MemoryPipelineArtifactStore } from '../types.js';

const DETAIL_DIR = path.join('artifacts', 'detail');
const INDEX_DIR = path.join('artifacts', 'index');
const DESCRIPTOR_DIR = path.join('artifacts', 'descriptors');

interface ArtifactSubpath {
  dir: string;
  fileName: string;
}

export class ArtifactStore implements MemoryPipelineArtifactStore {
  private rootDir: string;
  private rootRealPathPromise?: Promise<string>;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async writeArtifact(input: ArtifactWriteInput): Promise<ArtifactDescriptor> {
    const id = this.buildId(input.kind);
    const dir = this.resolveDir(input.kind, input.runId);
    const { dir: relativeDir, fileName } = await this.ensureInsideRootPath(
      path.join(dir, `${id}.json`),
    );
    const absoluteDir = path.join(this.rootDir, relativeDir);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, fileName), input.body, 'utf8');

    const descriptor: ArtifactDescriptor = {
      id,
      kind: input.kind,
      version: 1,
      path: path.join(relativeDir, fileName),
      source: input.source,
      createdAt: Date.now(),
      upstreamIds: input.upstreamIds,
      metadata: input.metadata,
    };

    await this.persistDescriptor(descriptor);

    return descriptor;
  }

  async persistDescriptor(descriptor: ArtifactDescriptor): Promise<void> {
    this.validateDescriptorId(descriptor.id);
    await this.validateDescriptorPath(descriptor);

    const descriptorDir = path.join(this.rootDir, DESCRIPTOR_DIR);
    await mkdir(descriptorDir, { recursive: true });

    const { dir: relativeDir, fileName } = await this.ensureInsideRootPath(
      path.join(DESCRIPTOR_DIR, `${descriptor.id}.json`),
    );

    await writeFile(
      path.join(this.rootDir, relativeDir, fileName),
      JSON.stringify(descriptor, null, 2),
      'utf8',
    );
  }

  async getDescriptor(id: string): Promise<ArtifactDescriptor | undefined> {
    this.validateDescriptorId(id);
    const { dir: relativeDir, fileName } = await this.ensureInsideRootPath(
      path.join(DESCRIPTOR_DIR, `${id}.json`),
    );
    try {
      return JSON.parse(
        await readFile(path.join(this.rootDir, relativeDir, fileName), 'utf8'),
      ) as ArtifactDescriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  private resolveDir(kind: string, runId?: string): string {
    if (kind === 'detail-record') {
      return DETAIL_DIR;
    }

    if (kind === 'memory-index') {
      return INDEX_DIR;
    }

    const normalizedRun = this.normalizeSegment(runId ?? 'default');
    return path.join('runs', normalizedRun, 'stages');
  }

  private buildId(kind: string): string {
    const safeKind = this.normalizeSegment(kind);
    const timestamp = Date.now();
    const suffix = Math.random().toString(16).slice(2, 8);
    return `${safeKind}-${timestamp}-${suffix}`;
  }

  private normalizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
  }

  private validateDescriptorId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('invalid descriptor id');
    }
  }

  private async validateDescriptorPath(descriptor: ArtifactDescriptor): Promise<void> {
    if (!descriptor.path) {
      throw new Error('descriptor.path must be set');
    }
    await this.ensureInsideRootPath(descriptor.path);
  }

  private async ensureInsideRootPath(subPath: string): Promise<ArtifactSubpath> {
    const rootReal = await this.getRootRealPath();
    const absoluteTarget = path.resolve(this.rootDir, subPath);
    const relativeToRoot = path.relative(this.rootDir, absoluteTarget);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error('path escapes root directory');
    }

    const resolvedTarget = path.resolve(rootReal, relativeToRoot);
    await this.ensureNoSymlinkTraversal(rootReal, resolvedTarget);

    const relative = path.relative(rootReal, resolvedTarget);
    return {
      dir: path.dirname(relative) === '.' ? '' : path.dirname(relative),
      fileName: path.basename(resolvedTarget),
    };
  }

  private async ensureNoSymlinkTraversal(base: string, target: string): Promise<void> {
    const relative = path.relative(base, target);
    const segments = relative.split(path.sep).filter(Boolean);
    let current = base;
    for (const segment of segments) {
      current = path.join(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink()) {
          throw new Error('path escapes root directory');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          break;
        }
        throw error;
      }
    }
  }

  private getRootRealPath(): Promise<string> {
    if (this.rootRealPathPromise) {
      return this.rootRealPathPromise;
    }
    this.rootRealPathPromise = realpath(this.rootDir)
      .then((real) => {
        this.rootDir = real;
        return real;
      })
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('root directory does not exist');
        }
        throw error;
      });
    return this.rootRealPathPromise;
  }
}
