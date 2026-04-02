import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type ResolveInstalledPackageRootOptions = {
  packageRoot?: string;
};

export function resolveInstalledPackageRoot(
  packageName: string,
  options: ResolveInstalledPackageRootOptions = {},
): string | null {
  if (options.packageRoot) {
    const resolvedPackageRoot = path.resolve(options.packageRoot);
    const explicitPackageJsonPath = path.join(
      resolvedPackageRoot,
      'node_modules',
      ...packageName.split('/'),
      'package.json',
    );
    if (existsSync(explicitPackageJsonPath)) {
      return path.dirname(explicitPackageJsonPath);
    }

    // When callers provide an explicit package root, only treat packages inside that
    // package's own node_modules as "installed". Do not fall back to workspace/module
    // resolution outside the provided root, or tests and packaging logic will
    // accidentally resolve repo worktree packages as if they were installed artifacts.
    return null;
  }

  const resolver = createRequire(import.meta.url);

  try {
    return path.dirname(resolver.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

export function resolveNearestPackageRoot(startDir: string): string {
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
