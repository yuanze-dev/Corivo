import { mkdir, open, stat, unlink, link } from 'node:fs/promises';
import path from 'node:path';

const ACQUIRE_ATTEMPTS = 3;

export class FileRunLock {
  private locked = false;
  private ownerPath?: string;

  constructor(private readonly lockPath: string) {}

  async acquire(runId: string): Promise<void> {
    if (this.locked) {
      throw new Error(`memory pipeline already running (lock at ${this.lockPath})`);
    }

    await mkdir(path.dirname(this.lockPath), { recursive: true });

    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      const ownerPath = this.createOwnerFilePath(runId);
      let handle;
      try {
        handle = await open(ownerPath, 'wx');
        await this.writeLockContent(handle, runId);
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {});
        }
        await unlink(ownerPath).catch(() => {});
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
          continue;
        }
        throw error;
      }

      await handle.close().catch(() => {});

      try {
        await link(ownerPath, this.lockPath);
      } catch (error) {
        await unlink(ownerPath).catch(() => {});
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
          continue;
        }
        throw error;
      }

      this.ownerPath = ownerPath;
      this.locked = true;
      return;
    }

    throw new Error(`memory pipeline already running (lock at ${this.lockPath})`);
  }

  async release(): Promise<void> {
    if (!this.locked) {
      return;
    }

    this.locked = false;
    const ownerPath = this.ownerPath;
    this.ownerPath = undefined;

    if (!ownerPath) {
      return;
    }

    let ownerStats;
    try {
      ownerStats = await stat(ownerPath);
    } catch {
      ownerStats = undefined;
    }

    if (ownerStats) {
      try {
        const lockStats = await stat(this.lockPath);
        if (lockStats.ino === ownerStats.ino && lockStats.dev === ownerStats.dev) {
          await unlink(this.lockPath).catch(() => {});
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await unlink(ownerPath).catch(() => {});
  }

  protected createOwnerFilePath(runId: string): string {
    const dir = path.dirname(this.lockPath);
    const safeRun = runId.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 10) || 'run';
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const name = `.corivo-lock-${safeRun}-${suffix}`;
    return path.join(dir, name);
  }

  protected async writeLockContent(handle: ReturnType<typeof open>, runId: string): Promise<void> {
    await handle.writeFile(runId, 'utf8');
  }
}
