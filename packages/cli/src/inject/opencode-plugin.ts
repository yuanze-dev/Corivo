import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePreferredAssetRoot } from './host-assets.js';

const ASSET_ROOT_OVERRIDE_ENV = 'CORIVO_HOST_ASSETS_ROOT';
const OPENCODE_RUNTIME_BUNDLED_ROOT = path.join('dist', 'host-assets', 'runtime', 'opencode');
const OPENCODE_RUNTIME_REPO_ROOT = path.join('..', 'plugins', 'runtime', 'opencode', 'assets');
const OPENCODE_RUNTIME_ASSET_FILE = 'corivo.ts';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function injectGlobalOpencodePlugin(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  const home = process.env.HOME || os.homedir();
  const pluginDir = path.join(home, '.config', 'opencode', 'plugins');
  const filePath = path.join(pluginDir, 'corivo.ts');

  try {
    const packagedPluginPath = resolvePackagedOpencodePluginAssetPath();
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.copyFile(packagedPluginPath, filePath);
    return { success: true, path: filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function resolvePackagedOpencodePluginAssetPath(options: {
  packageRoot?: string;
  overrideRoot?: string | null;
} = {}): string {
  const packageRoot = options.packageRoot ?? resolvePackageRoot(__dirname);
  const configuredOverrideRoot = options.overrideRoot ?? process.env[ASSET_ROOT_OVERRIDE_ENV] ?? null;
  const selectedRoot = resolvePreferredAssetRoot({
    overrideRoot: configuredOverrideRoot ? path.join(configuredOverrideRoot, 'runtime', 'opencode') : null,
    bundledRoot: path.join(packageRoot, OPENCODE_RUNTIME_BUNDLED_ROOT),
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

function resolvePackageRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return path.resolve(startDir, '../..');
}
