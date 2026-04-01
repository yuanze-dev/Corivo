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
    const explicitPackageJsonPath = path.join(
      path.resolve(options.packageRoot),
      'node_modules',
      ...packageName.split('/'),
      'package.json',
    );
    if (existsSync(explicitPackageJsonPath)) {
      return path.dirname(explicitPackageJsonPath);
    }
  }

  const resolver = options.packageRoot
    ? createRequire(path.join(path.resolve(options.packageRoot), 'package.json'))
    : createRequire(import.meta.url);

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
