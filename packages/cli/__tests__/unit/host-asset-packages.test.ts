import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

describe('host asset package installer', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-asset-home-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
    delete process.env.CORIVO_HOST_ASSET_CACHE_ROOT;
    execFileMock.mockReset();
  });

  afterEach(async () => {
    process.env.HOME = previousHome;
    delete process.env.CORIVO_HOST_ASSET_CACHE_ROOT;
    vi.resetModules();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('returns the versioned cache install root for a host package', async () => {
    const { getHostAssetPackageInstallRoot } = await import('../../src/infrastructure/hosts/installers/host-asset-packages.js');

    expect(getHostAssetPackageInstallRoot('codex', { homeDir: tempHome, version: '0.12.7' })).toBe(
      path.join(tempHome, '.corivo', 'host-assets', 'packages', 'codex', '0.12.7'),
    );
  });

  it('does not run npm install when the cached package already exists', async () => {
    const cacheRoot = path.join(tempHome, '.corivo', 'host-assets');
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-asset-package-root-'));
    await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
    const cachedPackageRoot = path.join(cacheRoot, 'packages', 'codex', '0.12.7', 'node_modules', '@corivo-ai', 'codex');
    await fs.mkdir(cachedPackageRoot, { recursive: true });
    await fs.writeFile(path.join(cachedPackageRoot, 'package.json'), '{"name":"@corivo-ai/codex"}\n', 'utf8');

    const { ensureHostAssetPackage } = await import('../../src/infrastructure/hosts/installers/host-asset-packages.js');
    const result = await ensureHostAssetPackage('codex', { homeDir: tempHome, packageRoot, version: '0.12.7' });

    expect(result.packageRoot).toBe(cachedPackageRoot);
    expect(result.installed).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('installs the requested host package into the versioned cache when missing', async () => {
    execFileMock.mockImplementation((_command: string, args: string[], _options: unknown, callback: Function) => {
      const prefixIndex = args.indexOf('--prefix');
      const installRoot = args[prefixIndex + 1];
      const packageRoot = path.join(installRoot, 'node_modules', '@corivo-ai', 'codex');
      void fs.mkdir(packageRoot, { recursive: true })
        .then(() => fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"@corivo-ai/codex"}\n', 'utf8'))
        .then(() => callback(null, '', ''))
        .catch((error) => callback(error));
    });
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-asset-install-root-'));
    await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');

    const { ensureHostAssetPackage } = await import('../../src/infrastructure/hosts/installers/host-asset-packages.js');
    const result = await ensureHostAssetPackage('codex', { homeDir: tempHome, packageRoot, version: '0.12.7' });

    expect(result.installed).toBe(true);
    expect(result.packageRoot).toBe(
      path.join(tempHome, '.corivo', 'host-assets', 'packages', 'codex', '0.12.7', 'node_modules', '@corivo-ai', 'codex'),
    );
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--ignore-scripts',
        '--prefix',
        path.join(tempHome, '.corivo', 'host-assets', 'packages', 'codex', '0.12.7'),
        '@corivo-ai/codex@0.12.7',
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          npm_config_cache: path.join(tempHome, '.corivo', 'host-assets', 'npm-cache'),
        }),
      }),
      expect.any(Function),
    );
  });
});
