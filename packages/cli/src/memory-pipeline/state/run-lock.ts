import * as fsPromises from 'node:fs/promises';
import path from 'node:path';

interface FileHandle {
  writeFile(data: string, encoding: 'utf8'): Promise<void>;
  close(): Promise<void>;
  stat(): Promise<StatsLike>;
}

interface StatsLike {
  ino: number;
  dev: number;
}

const ACQUIRE_ATTEMPTS = 3;

export class FileRunLock {
  private locked = false;
  private ownerPath?: string;
  private ownerRunId?: string;
  private ownerToken?: string;
  private pendingRetiredPath?: string;

  constructor(private readonly lockPath: string) {}

  async acquire(runId: string): Promise<void> {
    if (this.locked) {
      throw new Error(`memory pipeline already running (lock at ${this.lockPath})`);
    }

    await fsPromises.mkdir(path.dirname(this.lockPath), { recursive: true });

    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      const ownerPath = this.createOwnerFilePath(runId);
      let handle: FileHandle | undefined;
      try {
        handle = await fsPromises.open(ownerPath, 'wx');
        const ownerToken = this.createOwnerToken();
        await this.writeLockContent(handle, ownerToken, runId);
        this.ownerToken = ownerToken;
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {});
        }
        await fsPromises.unlink(ownerPath).catch(() => {});
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
          continue;
        }
        throw error;
      }

      await handle.close().catch(() => {});

      try {
        await fsPromises.link(ownerPath, this.lockPath);
      } catch (error) {
        await fsPromises.unlink(ownerPath).catch(() => {});
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
          continue;
        }
        throw error;
      }

      this.ownerPath = ownerPath;
      this.locked = true;
      this.ownerRunId = runId;
      return;
    }

    throw new Error(`memory pipeline already running (lock at ${this.lockPath})`);
  }

  async release(): Promise<void> {
    if (!this.locked) {
      return;
    }

    const ownerPath = this.ownerPath;
    const ownerToken = this.ownerToken;
    if (this.pendingRetiredPath) {
      await this.cleanupRetiredPath(this.pendingRetiredPath);
      this.pendingRetiredPath = undefined;
    }
    let retiredPath: string | undefined;
    let releaseComplete = false;

    try {
      if (!ownerPath) {
        retiredPath = await this.cleanupLockForToken(ownerToken);
        if (retiredPath) {
          this.pendingRetiredPath = retiredPath;
        }
        releaseComplete = true;
      } else {
        let ownerStats: StatsLike | undefined;
        try {
          ownerStats = await this.getStats(ownerPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            ownerStats = undefined;
          } else {
            throw error;
          }
        }

        if (ownerStats) {
          let lockStats: StatsLike | undefined;
          try {
            lockStats = await this.getStats(this.lockPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
              lockStats = undefined;
            } else {
              throw error;
            }
          }

          if (!lockStats) {
            releaseComplete = true;
          } else if (lockStats.ino === ownerStats.ino && lockStats.dev === ownerStats.dev) {
            retiredPath = await this.getRetiredPath(ownerToken);
            this.pendingRetiredPath = retiredPath;
            await this.renameLockPath(retiredPath);
            releaseComplete = true;
          } else {
            releaseComplete = true;
          }
        } else {
          retiredPath = await this.cleanupLockForToken(ownerToken);
          if (retiredPath) {
            this.pendingRetiredPath = retiredPath;
          }
          releaseComplete = true;
        }
      }
    } finally {
      if (releaseComplete) {
        if (retiredPath) {
          await this.cleanupRetiredPath(retiredPath);
          this.pendingRetiredPath = undefined;
        }
        if (ownerPath) {
          await this.unlinkOwnerPath(ownerPath);
        }
        this.ownerPath = undefined;
        this.ownerToken = undefined;
        this.ownerRunId = undefined;
        this.locked = false;
      }
    }
  }

  protected createOwnerFilePath(runId: string): string {
    const dir = path.dirname(this.lockPath);
    const safeRun = runId.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 10) || 'run';
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const name = `.corivo-lock-${safeRun}-${suffix}`;
    return path.join(dir, name);
  }

  protected async writeLockContent(handle: FileHandle, token: string, runId: string): Promise<void> {
    await handle.writeFile(`${token}:${runId}`, 'utf8');
  }

  protected async getStats(target: string): Promise<StatsLike> {
    return fsPromises.stat(target);
  }

  protected async unlinkLockPath(): Promise<void> {
    await fsPromises.unlink(this.lockPath);
  }

  protected async unlinkOwnerPath(ownerPath: string): Promise<void> {
    try {
      await fsPromises.unlink(ownerPath);
    } catch {
      // ignore
    }
  }

  protected createOwnerToken(): string {
    const random = Math.random().toString(16).slice(2, 12);
    return `${Date.now()}-${random}`;
  }

  protected async getRetiredPath(token?: string): Promise<string> {
    const dir = path.dirname(this.lockPath);
    const safeToken = (token ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
    return path.join(dir, `.corivo-lock-retired-${safeToken}-${Date.now()}`);
  }

  protected async renameLockPath(retiredPath: string): Promise<void> {
    await fsPromises.rename(this.lockPath, retiredPath);
  }

  protected async cleanupRetiredPath(retiredPath: string): Promise<void> {
    try {
      await fsPromises.unlink(retiredPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  protected async cleanupLockForToken(token?: string): Promise<string | undefined> {
    if (!token) {
      return undefined;
    }

    try {
      const content = (await fsPromises.readFile(this.lockPath, 'utf8')).trim();
      const separator = content.indexOf(':');
      const storedToken = separator === -1 ? content : content.slice(0, separator);
      if (storedToken === token) {
        const retiredPath = await this.getRetiredPath(token);
        await this.renameLockPath(retiredPath);
        return retiredPath;
      }
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
