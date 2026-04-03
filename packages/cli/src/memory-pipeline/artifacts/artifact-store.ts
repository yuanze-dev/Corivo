import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ArtifactDescriptor,
  ArtifactQuery,
  ArtifactWriteInput,
  FinalMemoryFileKind,
  MemoryPipelineArtifactStore,
} from '../types.js';

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

  getMemoryRootDir(): string {
    return path.join(this.rootDir, '..', 'memory');
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
      return await this.readAndValidateDescriptorFile(path.join(this.rootDir, relativeDir, fileName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async readArtifact(id: string): Promise<string> {
    const descriptor = await this.getDescriptor(id);
    if (!descriptor) {
      throw new Error(`artifact not found: ${id}`);
    }

    const { dir: relativeDir, fileName } = await this.ensureInsideRootPath(descriptor.path);
    return readFile(path.join(this.rootDir, relativeDir, fileName), 'utf8');
  }

  async listArtifacts(query?: ArtifactQuery): Promise<ArtifactDescriptor[]> {
    const descriptorDir = path.join(this.rootDir, DESCRIPTOR_DIR);
    let files: string[];
    try {
      files = await readdir(descriptorDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const descriptors = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => this.readAndValidateDescriptorFile(path.join(descriptorDir, file))),
    );

    return descriptors
      .filter((descriptor) => this.matchesQuery(descriptor, query))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async writeMemoryFile(relativePath: string, body: string): Promise<string> {
    const memoryRoot = this.getMemoryRootDir();
    await mkdir(memoryRoot, { recursive: true });
    const { dir: relativeDir, fileName } = await this.ensureInsideDirectory(memoryRoot, relativePath);
    const absoluteDir = path.join(memoryRoot, relativeDir);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, fileName), body, 'utf8');

    return path.join(relativeDir, fileName);
  }

  async readMemoryFile(relativePath: string): Promise<string> {
    const memoryRoot = this.getMemoryRootDir();
    const { dir: relativeDir, fileName } = await this.ensureInsideDirectory(memoryRoot, relativePath);
    return readFile(path.join(memoryRoot, relativeDir, fileName), 'utf8');
  }

  async listMemoryFiles(relativeDir = ''): Promise<string[]> {
    const memoryRoot = this.getMemoryRootDir();
    await mkdir(memoryRoot, { recursive: true });
    const { dir } = await this.ensureInsideDirectory(memoryRoot, relativeDir || '.');
    const startDir = path.join(memoryRoot, dir);
    const files: string[] = [];

    const walk = async (currentDir: string) => {
      let entries: string[];
      try {
        entries = await readdir(currentDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        throw error;
      }

      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry);
        const stats = await lstat(entryPath);
        if (stats.isSymbolicLink()) {
          throw new Error('path escapes root directory');
        }
        if (stats.isDirectory()) {
          await walk(entryPath);
          continue;
        }
        if (stats.isFile()) {
          files.push(path.relative(memoryRoot, entryPath));
        }
      }
    };

    await walk(startDir);

    return files.sort();
  }

  async listFinalMemoryFiles(kind: FinalMemoryFileKind = 'all'): Promise<string[]> {
    const allFinalFiles = await this.listMemoryFiles('final');
    if (kind === 'all') {
      return allFinalFiles;
    }
    if (kind === 'index') {
      return allFinalFiles.filter((file) => file.endsWith('/MEMORY.md'));
    }
    return allFinalFiles.filter((file) => file.endsWith('.md') && !file.endsWith('/MEMORY.md'));
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

  private matchesQuery(descriptor: ArtifactDescriptor, query?: ArtifactQuery): boolean {
    if (!query) {
      return true;
    }

    if (query.source && descriptor.source !== query.source) {
      return false;
    }

    if (query.kind && descriptor.kind !== query.kind) {
      return false;
    }

    if (query.runId) {
      const normalizedRunId = this.normalizeSegment(query.runId);
      const runPrefix = path.join('runs', normalizedRunId, 'stages') + path.sep;
      if (!descriptor.path.startsWith(runPrefix)) {
        return false;
      }
    }

    return true;
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

  private async readAndValidateDescriptorFile(filePath: string): Promise<ArtifactDescriptor> {
    const descriptor = JSON.parse(await readFile(filePath, 'utf8')) as ArtifactDescriptor;
    this.validateDescriptorId(descriptor.id);
    await this.validateDescriptorPath(descriptor);
    return descriptor;
  }

  private async validateDescriptorPath(descriptor: ArtifactDescriptor): Promise<void> {
    if (!descriptor.path) {
      throw new Error('descriptor.path must be set');
    }
    await this.ensureInsideRootPath(descriptor.path);
  }

  private async ensureInsideRootPath(subPath: string): Promise<ArtifactSubpath> {
    return this.ensureInsideDirectory(this.rootDir, subPath);
  }

  private async ensureInsideDirectory(baseDir: string, subPath: string): Promise<ArtifactSubpath> {
    const baseReal = await this.getRealPath(baseDir);
    const absoluteTarget = path.resolve(baseDir, subPath);
    const relativeToRoot = path.relative(baseDir, absoluteTarget);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error('path escapes root directory');
    }

    const resolvedTarget = path.resolve(baseReal, relativeToRoot);
    await this.ensureNoSymlinkTraversal(baseReal, resolvedTarget);

    const relative = path.relative(baseReal, resolvedTarget);
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
    this.rootRealPathPromise = this.getRealPath(this.rootDir).then((real) => {
      this.rootDir = real;
      return real;
    });
    return this.rootRealPathPromise;
  }

  private async getRealPath(targetDir: string): Promise<string> {
    return realpath(targetDir)
      .then((real) => {
        return real;
      })
      .catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('root directory does not exist');
        }
        throw error;
      });
  }
}
