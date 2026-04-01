import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePreferredAssetRoot } from './host-assets.js';
import {
  resolveInstalledPackageRoot,
  resolveNearestPackageRoot,
} from './package-assets.js';
import type { HostDoctorResult, HostInstallResult } from '../hosts/types.js';

const ASSET_ROOT_OVERRIDE_ENV = 'CORIVO_HOST_ASSETS_ROOT';
const OPENCODE_RUNTIME_PACKAGE_NAME = '@corivo-ai/opencode';
const OPENCODE_RUNTIME_REPO_ROOT = path.join('..', 'plugins', 'runtime', 'opencode', 'assets');
const OPENCODE_RUNTIME_ASSET_FILE = 'corivo.ts';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpencodePaths {
  homeDir: string;
  pluginDir: string;
  pluginPath: string;
}

export function getOpencodePaths(homeDir: string = process.env.HOME || os.homedir()): OpencodePaths {
  const pluginDir = path.join(homeDir, '.config', 'opencode', 'plugins');
  return {
    homeDir,
    pluginDir,
    pluginPath: path.join(pluginDir, 'corivo.ts'),
  };
}

export async function injectGlobalOpencodePlugin(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const result = await installOpencodeHost();
  return {
    success: result.success,
    path: result.path,
    error: result.error,
  };
}

export async function installOpencodeHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getOpencodePaths(homeDir);

  try {
    const packagedPluginPath = resolvePackagedOpencodePluginAssetPath();
    await fs.mkdir(paths.pluginDir, { recursive: true });
    await fs.copyFile(packagedPluginPath, paths.pluginPath);
    return {
      success: true,
      host: 'opencode',
      path: paths.pluginPath,
      summary: 'OpenCode host installed',
    };
  } catch (error) {
    return {
      success: false,
      host: 'opencode',
      path: paths.pluginPath,
      summary: 'OpenCode host install failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function resolvePackagedOpencodePluginAssetPath(options: {
  packageRoot?: string;
  overrideRoot?: string | null;
} = {}): string {
  const packageRoot = options.packageRoot ?? resolveNearestPackageRoot(__dirname);
  const configuredOverrideRoot = options.overrideRoot ?? process.env[ASSET_ROOT_OVERRIDE_ENV] ?? null;
  const explicitInstalledPackageRoot = path.join(
    packageRoot,
    'node_modules',
    ...OPENCODE_RUNTIME_PACKAGE_NAME.split('/'),
  );
  const installedPackageRoot = existsSync(path.join(explicitInstalledPackageRoot, 'package.json'))
    ? explicitInstalledPackageRoot
    : resolveInstalledPackageRoot(OPENCODE_RUNTIME_PACKAGE_NAME, { packageRoot });
  const selectedRoot = resolvePreferredAssetRoot({
    overrideRoot: configuredOverrideRoot ? path.join(configuredOverrideRoot, 'runtime', 'opencode') : null,
    packageRoot: installedPackageRoot ? path.join(installedPackageRoot, 'assets') : null,
    repoRoot: path.join(packageRoot, OPENCODE_RUNTIME_REPO_ROOT),
    scopeLabel: 'Corivo OpenCode runtime assets',
  });
  const assetPath = path.join(selectedRoot.root, OPENCODE_RUNTIME_ASSET_FILE);

  if (existsSync(assetPath)) {
    return assetPath;
  }

  throw new Error(
    `Missing packaged OpenCode runtime asset. Checked paths: ${assetPath}. Rebuild or reinstall corivo if published assets are missing.`,
  );
}

export async function isOpencodeInstalled(homeDir?: string): Promise<HostDoctorResult> {
  const paths = getOpencodePaths(homeDir);
  const content = await readFileIfExists(paths.pluginPath);

  const checks = [
    {
      label: 'corivo.ts',
      ok: content.includes("runCorivo('query'"),
      detail: paths.pluginPath,
    },
  ];

  return {
    ok: checks.every((item) => item.ok),
    host: 'opencode',
    checks,
  };
}

export async function uninstallOpencodeHost(homeDir?: string): Promise<HostInstallResult> {
  const paths = getOpencodePaths(homeDir);

  try {
    await fs.rm(paths.pluginPath, { force: true });
    return {
      success: true,
      host: 'opencode',
      path: paths.pluginPath,
      summary: 'OpenCode host uninstalled',
    };
  } catch (error) {
    return {
      success: false,
      host: 'opencode',
      path: paths.pluginPath,
      summary: 'OpenCode host uninstall failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
