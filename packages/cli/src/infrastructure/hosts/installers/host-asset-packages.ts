import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hostDeclarations, type HostId } from './host-manifest.js';
import {
  resolveInstalledPackageRoot,
  resolveNearestPackageRoot,
} from './package-assets.js';

const execFileAsync = promisify(execFile);
const HOST_ASSET_CACHE_ROOT_ENV = 'CORIVO_HOST_ASSET_CACHE_ROOT';
const DEFAULT_NPM_CACHE_DIRNAME = 'npm-cache';
const HOST_ASSET_ROOT_ENV = 'CORIVO_HOST_ASSETS_ROOT';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type HostAssetPackageOptions = {
  homeDir?: string;
  packageRoot?: string;
  version?: string;
  cacheRoot?: string;
};

export function getHostAssetCacheRoot(homeDir: string = process.env.HOME || os.homedir()): string {
  const configuredRoot = process.env[HOST_ASSET_CACHE_ROOT_ENV]?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  return path.join(homeDir, '.corivo', 'host-assets');
}

export function getHostAssetPackageVersion(options: Pick<HostAssetPackageOptions, 'packageRoot' | 'version'> = {}): string {
  if (options.version?.trim()) {
    return options.version.trim();
  }

  const packageRoot = options.packageRoot ?? resolveNearestPackageRoot(__dirname);
  const packageJsonPath = path.join(packageRoot, 'package.json');

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
    if (packageJson.version?.trim()) {
      return packageJson.version.trim();
    }
  } catch {
    // fall through to a clear error
  }

  throw new Error(`Unable to determine Corivo CLI version from ${packageJsonPath}.`);
}

export function getHostAssetPackageInstallRoot(host: HostId, options: HostAssetPackageOptions = {}): string {
  const version = getHostAssetPackageVersion(options);
  const cacheRoot = options.cacheRoot ?? getHostAssetCacheRoot(options.homeDir);
  return path.join(cacheRoot, 'packages', host, version);
}

export function resolveCachedHostAssetPackageRoot(host: HostId, options: HostAssetPackageOptions = {}): string | null {
  const installRoot = getHostAssetPackageInstallRoot(host, options);
  return resolveInstalledPackageRoot(hostDeclarations[host].packageName, { packageRoot: installRoot });
}

export async function ensureHostAssetPackage(
  host: HostId,
  options: HostAssetPackageOptions = {},
): Promise<{
  packageRoot: string;
  installed: boolean;
  version: string;
}> {
  const version = getHostAssetPackageVersion(options);
  const cacheRoot = options.cacheRoot ?? getHostAssetCacheRoot(options.homeDir);
  const installRoot = getHostAssetPackageInstallRoot(host, {
    ...options,
    cacheRoot,
    version,
  });
  const packageName = hostDeclarations[host].packageName;
  if (hasLocalHostAssets(host, options.packageRoot ?? resolveNearestPackageRoot(__dirname))) {
    return {
      packageRoot: '',
      installed: false,
      version,
    };
  }
  const existingPackageRoot = resolveCachedHostAssetPackageRoot(host, {
    ...options,
    cacheRoot,
    version,
  });

  if (existingPackageRoot) {
    return {
      packageRoot: existingPackageRoot,
      installed: false,
      version,
    };
  }

  const npmCacheDir = path.join(cacheRoot, DEFAULT_NPM_CACHE_DIRNAME);
  await fs.mkdir(installRoot, { recursive: true });
  await fs.mkdir(npmCacheDir, { recursive: true });

  await execFileAsync(
    'npm',
    [
      'install',
      '--no-save',
      '--no-package-lock',
      '--ignore-scripts',
      '--prefix',
      installRoot,
      `${packageName}@${version}`,
    ],
    {
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
    },
  );

  const packageRoot = resolveCachedHostAssetPackageRoot(host, {
    ...options,
    cacheRoot,
    version,
  });

  if (!packageRoot) {
    throw new Error(`Installed ${packageName}@${version}, but failed to locate its package root under ${installRoot}.`);
  }

  return {
    packageRoot,
    installed: true,
    version,
  };
}

function hasLocalHostAssets(host: HostId, packageRoot: string): boolean {
  const overrideRoot = process.env[HOST_ASSET_ROOT_ENV]?.trim();
  if (overrideRoot) {
    return true;
  }

  const explicitInstalledPackageRoot = path.join(packageRoot, 'node_modules', ...hostDeclarations[host].packageName.split('/'));
  if (pathExistsSync(path.join(explicitInstalledPackageRoot, 'package.json'))) {
    return true;
  }

  if (resolveInstalledPackageRoot(hostDeclarations[host].packageName, { packageRoot })) {
    return true;
  }

  const repoPluginRoot = path.join(packageRoot, '..', 'plugins', hostDeclarations[host].directory);
  if (host === 'opencode') {
    return pathExistsSync(path.join(repoPluginRoot, 'assets', 'corivo.ts'));
  }

  return pathExistsSync(repoPluginRoot);
}

function pathExistsSync(targetPath: string): boolean {
  return existsSync(targetPath);
}
