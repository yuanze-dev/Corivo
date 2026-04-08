import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateOpencodePluginAsset } from '../../../plugins/opencode/scripts/sync-asset.mjs';
import {
  injectGlobalOpencodePlugin,
  resolvePackagedOpencodePluginAssetPath,
} from '../../src/infrastructure/hosts/installers/opencode-plugin.js';

const PACKAGED_OPENCODE_PLUGIN_ASSET = fileURLToPath(
  new URL('../../../plugins/opencode/assets/corivo.ts', import.meta.url),
);

describe('OpenCode Corivo integration', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-inject-'));
    previousHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    delete process.env.CORIVO_HOST_ASSETS_ROOT;
    process.env.HOME = previousHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('installs the packaged OpenCode plugin asset', async () => {
    const packagedPlugin = await fs.readFile(PACKAGED_OPENCODE_PLUGIN_ASSET, 'utf8');
    const result = await injectGlobalOpencodePlugin();
    const pluginPath = path.join(tempHome, '.config', 'opencode', 'plugins', 'corivo.ts');
    const content = await fs.readFile(pluginPath, 'utf8');

    expect(result.success).toBe(true);
    expect(result.path).toBe(pluginPath);
    expect(content).toBe(packagedPlugin);
    expect(content).toContain('experimental.chat.system.transform');
    expect(content).toContain("runCorivo('recall'");
  });

  it('prefers an overridden packaged OpenCode asset root when provided', async () => {
    const bundledRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = bundledRoot;

    try {
      const expectedPlugin = '// bundled opencode plugin\nexport default async function bundledPlugin() {}\n';
      const overrideAssetPath = path.join(bundledRoot, 'runtime', 'opencode', 'corivo.ts');
      await fs.mkdir(path.dirname(overrideAssetPath), { recursive: true });
      await fs.writeFile(overrideAssetPath, expectedPlugin, 'utf8');

      const result = await injectGlobalOpencodePlugin();
      const pluginPath = path.join(tempHome, '.config', 'opencode', 'plugins', 'corivo.ts');
      const content = await fs.readFile(pluginPath, 'utf8');

      expect(result.success).toBe(true);
      expect(content).toBe(expectedPlugin);
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(bundledRoot, { recursive: true, force: true });
    }
  });

  it('treats an override root as authoritative and fails when its OpenCode asset is missing', async () => {
    const bundledRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-missing-override-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = bundledRoot;

    try {
      await fs.mkdir(path.join(bundledRoot, 'runtime', 'opencode'), { recursive: true });

      const result = await injectGlobalOpencodePlugin();

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        path.join(bundledRoot, 'runtime', 'opencode', 'corivo.ts'),
      );
      expect(result.error).not.toContain(PACKAGED_OPENCODE_PLUGIN_ASSET);
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(bundledRoot, { recursive: true, force: true });
    }
  });

  it('uses the repo runtime asset only when no bundled dist root exists', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-package-root-'));
    const repoAssetPath = path.join(packageRoot, '..', 'plugins', 'opencode', 'assets', 'corivo.ts');

    try {
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(path.dirname(repoAssetPath), { recursive: true });
      await fs.writeFile(repoAssetPath, '// repo opencode plugin\n', 'utf8');

      expect(resolvePackagedOpencodePluginAssetPath({ packageRoot })).toBe(repoAssetPath);
    } finally {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
  });

  it('uses the installed @corivo-ai/opencode package asset when available under node_modules', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-installed-package-root-'));
    const installedAssetPath = path.join(
      packageRoot,
      'node_modules',
      '@corivo-ai',
      'opencode',
      'assets',
      'corivo.ts',
    );

    try {
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(path.dirname(installedAssetPath), { recursive: true });
      await fs.writeFile(
        path.join(packageRoot, 'node_modules', '@corivo-ai', 'opencode', 'package.json'),
        '{"name":"@corivo-ai/opencode"}\n',
        'utf8',
      );
      await fs.writeFile(installedAssetPath, '// installed opencode plugin\n', 'utf8');

      expect(await fs.realpath(resolvePackagedOpencodePluginAssetPath({ packageRoot }))).toBe(
        await fs.realpath(installedAssetPath),
      );
    } finally {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
  });

  it('uses the cached @corivo-ai/opencode package asset when local package and repo assets are absent', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-cache-package-root-'));
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-cache-root-'));
    const cachedAssetPath = path.join(
      cacheRoot,
      'packages',
      'opencode',
      '0.12.7',
      'node_modules',
      '@corivo-ai',
      'opencode',
      'assets',
      'corivo.ts',
    );

    try {
      process.env.CORIVO_HOST_ASSET_CACHE_ROOT = cacheRoot;
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(path.dirname(cachedAssetPath), { recursive: true });
      await fs.writeFile(
        path.join(cacheRoot, 'packages', 'opencode', '0.12.7', 'node_modules', '@corivo-ai', 'opencode', 'package.json'),
        '{"name":"@corivo-ai/opencode"}\n',
        'utf8',
      );
      await fs.writeFile(cachedAssetPath, '// cached opencode plugin\n', 'utf8');

      expect(await fs.realpath(resolvePackagedOpencodePluginAssetPath({ packageRoot }))).toBe(
        await fs.realpath(cachedAssetPath),
      );
    } finally {
      delete process.env.CORIVO_HOST_ASSET_CACHE_ROOT;
      await fs.rm(packageRoot, { recursive: true, force: true });
      await fs.rm(cacheRoot, { recursive: true, force: true });
    }
  });

  it('fails when an installed @corivo-ai/opencode package exists but its asset is missing', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-opencode-installed-root-'));
    const installedRoot = path.join(packageRoot, 'node_modules', '@corivo-ai', 'opencode');
    const repoAssetPath = path.join(packageRoot, '..', 'plugins', 'opencode', 'assets', 'corivo.ts');

    try {
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(installedRoot, { recursive: true });
      await fs.writeFile(path.join(installedRoot, 'package.json'), '{"name":"@corivo-ai/opencode"}\n', 'utf8');
      await fs.mkdir(path.dirname(repoAssetPath), { recursive: true });
      await fs.writeFile(repoAssetPath, '// repo opencode plugin\n', 'utf8');

      expect(() => resolvePackagedOpencodePluginAssetPath({ packageRoot })).toThrowError(
        `Missing packaged OpenCode runtime asset. Checked paths: ${path.join(
          installedRoot,
          'assets',
          'corivo.ts',
        )}.`,
      );
    } finally {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
  });

  it('keeps the checked-in runtime asset synchronized with the generated single-file output', async () => {
    const packagedPlugin = await fs.readFile(PACKAGED_OPENCODE_PLUGIN_ASSET, 'utf8');
    const generatedPlugin = await generateOpencodePluginAsset();

    expect(packagedPlugin).toBe(generatedPlugin);
    expect(packagedPlugin).not.toContain("from './");
    expect(packagedPlugin).not.toContain("from \"./");
    expect(packagedPlugin).not.toContain("import { createOpencodeCorivoHooks } from './adapter.js';");
    expect(packagedPlugin.match(/export function createOpencodeCorivoHooks/g)).toHaveLength(1);
    expect(packagedPlugin).toContain('state.carryOver = undefined');
  });
});
