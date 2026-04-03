import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import packageJson from '../../package.json';

const httpsGetMock = vi.fn();
const execFileSyncMock = vi.fn();

vi.mock('node:https', () => ({
  default: {
    get: httpsGetMock,
  },
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

function mockRegistryResponse(statusCode: number, body: unknown) {
  httpsGetMock.mockImplementationOnce((url: string, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
    const response = new EventEmitter() as EventEmitter & { statusCode?: number };
    response.statusCode = statusCode;

    queueMicrotask(() => {
      callback(response);
      if (statusCode === 200) {
        response.emit('data', JSON.stringify(body));
      }
      response.emit('end');
    });

    return {
      on: vi.fn().mockReturnThis(),
    };
  });
}

describe('update checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the current package version', async () => {
    const { getCurrentVersion } = await import('../../src/update/checker');

    expect(getCurrentVersion()).toBe(packageJson.version);
  });

  it('checks the latest version from npm registry metadata', async () => {
    const { checkForUpdate } = await import('../../src/update/checker');

    mockRegistryResponse(200, {
      'dist-tags': { latest: packageJson.version },
      time: {
        [packageJson.version]: '2026-03-25T19:36:51.972Z',
      },
    });

    const status = await checkForUpdate();

    expect(status.currentVersion).toBe(packageJson.version);
    expect(status.latestVersion).toBe(packageJson.version);
    expect(status.hasUpdate).toBe(false);
    expect(status.isBreaking).toBe(false);
  });

  it('reports an available update from npm registry metadata', async () => {
    vi.stubEnv('CORIVO_CURRENT_VERSION', '0.11.0');
    const { checkForUpdate } = await import('../../src/update/checker');

    mockRegistryResponse(200, {
      'dist-tags': { latest: '0.12.1' },
      time: {
        '0.12.1': '2026-03-25T19:36:51.972Z',
      },
    });

    const status = await checkForUpdate();

    expect(status.currentVersion).toBe('0.11.0');
    expect(status.latestVersion).toBe('0.12.1');
    expect(status.hasUpdate).toBe(true);
  });

  it('runs npm global install for the requested version', async () => {
    const { performUpdate } = await import('../../src/update/checker');

    const result = await performUpdate({
      version: '0.12.1',
      released_at: '2026-03-25T19:36:51.972Z',
      breaking: false,
      changelog: '',
      binaries: {
        'Darwin-arm64': { url: '', checksum: '' },
        'Darwin-x64': { url: '', checksum: '' },
        'Linux-x64': { url: '', checksum: '' },
      },
    }, 'Darwin-arm64');

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'corivo@0.12.1'],
      expect.objectContaining({
        encoding: 'utf-8',
      })
    );
    expect(result.success).toBe(true);
  });

  it('returns a graceful status when npm registry is unavailable', async () => {
    const { checkForUpdate } = await import('../../src/update/checker');

    httpsGetMock.mockImplementationOnce((url: string, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
      const response = new EventEmitter() as EventEmitter & { statusCode?: number };
      response.statusCode = 404;
      queueMicrotask(() => {
        callback(response);
      });
      return {
        on: vi.fn().mockReturnThis(),
      };
    });

    const status = await checkForUpdate();

    expect(status.hasUpdate).toBe(false);
    expect(status.latestVersion).toBeNull();
  });

  it('does not publish workspace protocol dependencies in the CLI manifest', () => {
    const dependencyEntries = Object.entries(packageJson.dependencies ?? {});
    const workspaceDependencies = dependencyEntries.filter(([, version]) => version.startsWith('workspace:'));

    expect(workspaceDependencies).toEqual([]);
  });
});
