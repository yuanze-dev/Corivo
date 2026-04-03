import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getSupportedHostIds,
  resolveHostsAssetRoot,
  resolvePreferredAssetRoot,
  resolveHostAssetRoot,
  resolveHostRawAssetPath,
  readHostTemplateText,
} from '../../src/hosts/installers/host-assets.js';

describe('host assets loader', () => {
  afterEach(() => {
    delete process.env.CORIVO_HOST_ASSETS_ROOT;
  });

  it('resolves host asset root by host name', () => {
    const hostsRoot = resolveHostsAssetRoot();
    const root = resolveHostAssetRoot('codex');
    expect(root).toBe(path.join(hostsRoot, 'codex'));
    expect(existsSync(root)).toBe(true);
  });

  it('reads text assets from packages/plugins/<host>', async () => {
    const text = await readHostTemplateText('codex', 'templates/AGENTS.codex.md');
    expect(text).toContain('## Corivo 记忆层（Codex）');
  });

  it('resolves host assets from installed plugin packages when given a package root', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-installed-host-package-root-'));
    const installedHostRoot = path.join(packageRoot, 'node_modules', '@corivo-ai', 'codex');
    const templatePath = path.join(installedHostRoot, 'templates', 'AGENTS.codex.md');
    const rawAssetPath = path.join(installedHostRoot, 'assets', 'corivo-logo.svg');

    try {
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.mkdir(path.dirname(rawAssetPath), { recursive: true });
      await fs.writeFile(path.join(installedHostRoot, 'package.json'), '{"name":"@corivo-ai/codex"}\n', 'utf8');
      await fs.writeFile(templatePath, '# packaged codex rules\n', 'utf8');
      await fs.writeFile(rawAssetPath, '<svg />', 'utf8');

      expect(await fs.realpath(resolveHostAssetRoot('codex', { packageRoot }))).toBe(await fs.realpath(installedHostRoot));
      expect(await fs.realpath(resolveHostRawAssetPath('codex', 'assets/corivo-logo.svg', { packageRoot }))).toBe(
        await fs.realpath(rawAssetPath),
      );
      await expect(readHostTemplateText('codex', 'templates/AGENTS.codex.md', { packageRoot })).resolves.toBe(
        '# packaged codex rules\n',
      );
    } finally {
      await fs.rm(packageRoot, { recursive: true, force: true });
    }
  });

  it('resolves host assets from the cached host package when local package and repo assets are absent', async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-cached-host-package-root-'));
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-cache-root-'));
    const cachedHostRoot = path.join(cacheRoot, 'packages', 'codex', '0.12.7', 'node_modules', '@corivo-ai', 'codex');
    const templatePath = path.join(cachedHostRoot, 'templates', 'AGENTS.codex.md');
    const rawAssetPath = path.join(cachedHostRoot, 'assets', 'corivo-logo.svg');

    try {
      process.env.CORIVO_HOST_ASSET_CACHE_ROOT = cacheRoot;
      await fs.writeFile(path.join(packageRoot, 'package.json'), '{"name":"test-cli","version":"0.12.7"}\n', 'utf8');
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.mkdir(path.dirname(rawAssetPath), { recursive: true });
      await fs.writeFile(path.join(cachedHostRoot, 'package.json'), '{"name":"@corivo-ai/codex"}\n', 'utf8');
      await fs.writeFile(templatePath, '# cached codex rules\n', 'utf8');
      await fs.writeFile(rawAssetPath, '<svg data-cache />', 'utf8');

      expect(await fs.realpath(resolveHostAssetRoot('codex', { packageRoot }))).toBe(await fs.realpath(cachedHostRoot));
      expect(await fs.realpath(resolveHostRawAssetPath('codex', 'assets/corivo-logo.svg', { packageRoot }))).toBe(
        await fs.realpath(rawAssetPath),
      );
      await expect(readHostTemplateText('codex', 'templates/AGENTS.codex.md', { packageRoot })).resolves.toBe(
        '# cached codex rules\n',
      );
    } finally {
      delete process.env.CORIVO_HOST_ASSET_CACHE_ROOT;
      await fs.rm(packageRoot, { recursive: true, force: true });
      await fs.rm(cacheRoot, { recursive: true, force: true });
    }
  });

  it('rejects unknown host names with a clear error', () => {
    expect(() => resolveHostAssetRoot('unknown-host')).toThrowError(
      'Unknown host "unknown-host". Supported hosts: claude-code, codex, cursor, opencode',
    );
  });

  it('declares bundled asset hosts explicitly for this stage', () => {
    expect(getSupportedHostIds()).toEqual(['claude-code', 'codex', 'cursor', 'opencode']);
    expect(() => resolveHostAssetRoot('opencode')).toThrowError(
      'Host "opencode" does not ship CLI-managed assets in this stage.',
    );
  });

  it('exposes helpers for raw-asset copy paths and template-text reads', async () => {
    const overrideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-host-helpers-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = overrideRoot;

    try {
      const rawAssetPath = path.join(overrideRoot, 'codex', 'assets', 'corivo-logo.svg');
      const templatePath = path.join(overrideRoot, 'codex', 'templates', 'AGENTS.codex.md');
      await fs.mkdir(path.dirname(rawAssetPath), { recursive: true });
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(rawAssetPath, '<svg />', 'utf8');
      await fs.writeFile(templatePath, '# helper template\n', 'utf8');

      expect(resolveHostRawAssetPath('codex', 'assets/corivo-logo.svg')).toBe(rawAssetPath);
      expect(existsSync(rawAssetPath)).toBe(true);
      await expect(readHostTemplateText('codex', 'templates/AGENTS.codex.md')).resolves.toBe('# helper template\n');
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(overrideRoot, { recursive: true, force: true });
    }
  });

  it('rejects absolute paths', () => {
    const absolute = path.resolve('/', 'tmp', 'corivo.txt');
    expect(() => resolveHostRawAssetPath('codex', absolute)).toThrowError(
      `Host asset path must be relative: ${absolute}`,
    );
  });

  it('rejects parent traversal segments', () => {
    expect(() => resolveHostRawAssetPath('codex', '../secrets.txt')).toThrowError(
      'Host asset path cannot contain parent traversal: ../secrets.txt',
    );
    expect(() => resolveHostRawAssetPath('codex', 'templates/../AGENTS.codex.md')).toThrowError(
      'Host asset path cannot contain parent traversal: templates/../AGENTS.codex.md',
    );
  });

  it('can resolve bundled host assets from an override root', async () => {
    const bundledRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-bundled-host-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = bundledRoot;

    try {
      const templatePath = path.join(bundledRoot, 'codex', 'templates', 'AGENTS.codex.md');
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(templatePath, '# bundled codex rules\n', 'utf8');

      expect(resolveHostsAssetRoot()).toBe(bundledRoot);
      expect(resolveHostAssetRoot('codex')).toBe(path.join(bundledRoot, 'codex'));
      await expect(readHostTemplateText('codex', 'templates/AGENTS.codex.md')).resolves.toBe('# bundled codex rules\n');
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(bundledRoot, { recursive: true, force: true });
    }
  });

  it('treats the override root as authoritative when it is explicitly set', async () => {
    const bundledRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-partial-host-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = bundledRoot;

    try {
      await fs.mkdir(path.join(bundledRoot, 'codex', 'templates'), { recursive: true });
      await expect(readHostTemplateText('codex', 'templates/AGENTS.codex.md')).rejects.toThrowError(
        `Missing host asset "templates/AGENTS.codex.md" for host "codex". Checked paths: ${path.join(
          bundledRoot,
          'codex',
          'templates',
          'AGENTS.codex.md',
        )}.`,
      );
      expect(() => resolveHostRawAssetPath('codex', 'templates/AGENTS.codex.md')).toThrowError(
        path.join(bundledRoot, 'codex', 'templates', 'AGENTS.codex.md'),
      );
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(bundledRoot, { recursive: true, force: true });
    }
  });

  it('chooses bundled roots ahead of repo roots, and only falls back to repo when bundled assets are absent', async () => {
    const overrideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-root-override-'));
    const packageAssetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-root-package-'));
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-root-repo-'));

    try {
      expect(
        resolvePreferredAssetRoot({
          overrideRoot,
          packageRoot: packageAssetRoot,
          repoRoot,
          scopeLabel: 'test host assets',
        }),
      ).toEqual({
        root: path.resolve(overrideRoot),
        source: 'override',
      });

      expect(
        resolvePreferredAssetRoot({
          packageRoot: packageAssetRoot,
          repoRoot,
          cacheRoot: overrideRoot,
          scopeLabel: 'test host assets',
        }),
      ).toEqual({
        root: packageAssetRoot,
        source: 'package',
      });

      await fs.rm(packageAssetRoot, { recursive: true, force: true });

      expect(
        resolvePreferredAssetRoot({
          packageRoot: packageAssetRoot,
          repoRoot,
          cacheRoot: overrideRoot,
          scopeLabel: 'test host assets',
        }),
      ).toEqual({
        root: repoRoot,
        source: 'repo',
      });

      await fs.rm(repoRoot, { recursive: true, force: true });

      expect(
        resolvePreferredAssetRoot({
          packageRoot: packageAssetRoot,
          repoRoot,
          cacheRoot: overrideRoot,
          scopeLabel: 'test host assets',
        }),
      ).toEqual({
        root: path.resolve(overrideRoot),
        source: 'cache',
      });
    } finally {
      await fs.rm(overrideRoot, { recursive: true, force: true });
      await fs.rm(packageAssetRoot, { recursive: true, force: true });
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('reports clear errors when a host asset is missing', async () => {
    const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'corivo-missing-host-assets-'));
    process.env.CORIVO_HOST_ASSETS_ROOT = missingRoot;

    try {
      await expect(readHostTemplateText('codex', 'templates/does-not-exist.mdc')).rejects.toThrowError(
        `Missing host asset "templates/does-not-exist.mdc" for host "codex"`,
      );
    } finally {
      delete process.env.CORIVO_HOST_ASSETS_ROOT;
      await fs.rm(missingRoot, { recursive: true, force: true });
    }
  });
});
