import fs from 'node:fs/promises';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveInstalledPackageRoot,
  resolveNearestPackageRoot,
} from './package-assets.js';

const HOST_ASSET_ROOT_ENV = 'CORIVO_HOST_ASSETS_ROOT';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hostDeclarations = {
  'claude-code': {
    directory: 'claude-code',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/claude-code',
  },
  codex: {
    directory: 'codex',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/codex',
  },
  cursor: {
    directory: 'cursor',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/cursor',
  },
  opencode: {
    directory: 'opencode',
    assetSupport: 'none',
    packageName: '@corivo-ai/opencode',
  },
} as const;

const hostIds = Object.keys(hostDeclarations) as Array<keyof typeof hostDeclarations>;
const assetBackedHostIds = hostIds.filter(
  (host): host is AssetBackedHostId => hostDeclarations[host].assetSupport === 'bundled',
);

export type HostId = keyof typeof hostDeclarations;
type AssetBackedHostId = {
  [K in HostId]: (typeof hostDeclarations)[K]['assetSupport'] extends 'bundled' ? K : never
}[HostId];

type CopyHostAssetOptions = {
  mode?: number;
};

type ResolveHostAssetOptions = {
  packageRoot?: string;
};

type HostAssetRootCandidate = {
  root: string;
  source: 'override' | 'package' | 'repo';
};

export function resolvePreferredAssetRoot(options: {
  overrideRoot?: string | null;
  packageRoot?: string | null;
  repoRoot?: string | null;
  scopeLabel: string;
}): HostAssetRootCandidate {
  const normalizedOverrideRoot = options.overrideRoot?.trim();
  if (normalizedOverrideRoot) {
    return {
      root: path.resolve(normalizedOverrideRoot),
      source: 'override',
    };
  }

  const normalizedPackageRoot = options.packageRoot ? path.resolve(options.packageRoot) : null;
  if (normalizedPackageRoot && existsSync(normalizedPackageRoot)) {
    return {
      root: normalizedPackageRoot,
      source: 'package',
    };
  }

  const normalizedRepoRoot = options.repoRoot ? path.resolve(options.repoRoot) : null;
  if (normalizedRepoRoot && existsSync(normalizedRepoRoot)) {
    return {
      root: normalizedRepoRoot,
      source: 'repo',
    };
  }

  throw new Error(
    buildMissingRootMessage(
      options.scopeLabel,
      [normalizedPackageRoot, normalizedRepoRoot].filter((candidate): candidate is string => Boolean(candidate)),
    ),
  );
}

export function resolveHostsAssetRoot(options: ResolveHostAssetOptions = {}): string {
  return resolveSelectedHostAssetRoot(options).root;
}

export function getSupportedHostIds(): readonly HostId[] {
  return hostIds;
}

export function resolveHostAssetRoot(host: string, options: ResolveHostAssetOptions = {}): string {
  const declaredHost = assertKnownHost(host);
  const assetBackedHost = assertAssetBackedHost(declaredHost);
  const root = resolveSelectedHostAssetRoot(options).root;
  return path.join(root, hostDeclarations[assetBackedHost].directory);
}

export function resolveHostRawAssetPath(host: string, relativePath: string, options: ResolveHostAssetOptions = {}): string {
  return resolveExistingHostAssetPath(host, relativePath, options).assetPath;
}

export async function readHostTemplateText(
  host: string,
  relativePath: string,
  options: ResolveHostAssetOptions = {},
): Promise<string> {
  const { assetPath } = resolveExistingHostAssetPath(host, relativePath, options);

  try {
    return await fs.readFile(assetPath, 'utf8');
  } catch (error) {
    throw wrapMissingAssetError(host, relativePath, error, options);
  }
}

export function readHostAssetSync(host: string, relativePath: string, options: ResolveHostAssetOptions = {}): string {
  const { assetPath } = resolveExistingHostAssetPath(host, relativePath, options);

  try {
    return readFileSync(assetPath, 'utf8');
  } catch (error) {
    throw wrapMissingAssetError(host, relativePath, error, options);
  }
}

export async function copyHostAsset(
  host: string,
  relativePath: string,
  targetPath: string,
  options: CopyHostAssetOptions = {},
): Promise<void> {
  const { assetPath } = resolveExistingHostAssetPath(host, relativePath);

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(assetPath),
      fs.stat(assetPath),
    ]);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
    await fs.chmod(targetPath, options.mode ?? stats.mode);
  } catch (error) {
    throw wrapMissingAssetError(host, relativePath, error);
  }
}

function resolveSelectedHostAssetRoot(options: ResolveHostAssetOptions = {}): HostAssetRootCandidate {
  const packageRoot = options.packageRoot ? path.resolve(options.packageRoot) : resolveNearestPackageRoot(__dirname);
  const packageCandidate = getInstalledHostAssetRootCandidate(packageRoot);
  const repoCandidate = getRepoHostAssetRootCandidate(packageRoot);
  return resolvePreferredAssetRoot({
    overrideRoot: process.env[HOST_ASSET_ROOT_ENV],
    packageRoot: packageCandidate?.root,
    repoRoot: repoCandidate?.root,
    scopeLabel: 'Corivo host assets',
  });
}

function getInstalledHostAssetRootCandidate(packageRoot: string): HostAssetRootCandidate | null {
  for (const host of assetBackedHostIds) {
    const explicitPackageRoot = path.join(packageRoot, 'node_modules', ...hostDeclarations[host].packageName.split('/'));
    if (existsSync(path.join(explicitPackageRoot, 'package.json'))) {
      return {
        root: path.dirname(explicitPackageRoot),
        source: 'package',
      };
    }

    const packageAssetRoot = resolveInstalledPackageRoot(hostDeclarations[host].packageName, { packageRoot });
    if (packageAssetRoot) {
      return {
        root: path.dirname(packageAssetRoot),
        source: 'package',
      };
    }
  }

  return null;
}

function getRepoHostAssetRootCandidate(packageRoot: string): HostAssetRootCandidate | null {
  const repoRoot = path.join(packageRoot, '..', 'plugins', 'hosts');
  if (!existsSync(repoRoot)) {
    return null;
  }

  return {
    root: repoRoot,
    source: 'repo',
  };
}

function resolveHostAssetPath(host: string, relativePath: string, root: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Host asset path must be relative: ${relativePath}`);
  }

  const rawSegments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (rawSegments.length === 0) {
    throw new Error('Host asset path must not be empty.');
  }
  if (rawSegments.includes('..')) {
    throw new Error(`Host asset path cannot contain parent traversal: ${relativePath}`);
  }

  const assetPath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, assetPath);

  if (
    relativeToRoot.startsWith('..') ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Host asset path escapes host root: ${relativePath}`);
  }

  return assetPath;
}

function resolveExistingHostAssetPath(
  host: string,
  relativePath: string,
  options: ResolveHostAssetOptions = {},
): {
  assetPath: string;
  checkedPaths: string[];
} {
  const declaredHost = assertKnownHost(host);
  const assetBackedHost = assertAssetBackedHost(declaredHost);
  const selectedRoot = resolveSelectedHostAssetRoot(options);
  const checkedPaths = [
    resolveHostAssetPath(
      assetBackedHost,
      relativePath,
      path.join(selectedRoot.root, hostDeclarations[assetBackedHost].directory),
    ),
  ];
  const assetPath = checkedPaths.find((candidatePath) => existsSync(candidatePath));
  if (assetPath) {
    return { assetPath, checkedPaths };
  }

  throw new Error(buildMissingAssetMessage(assetBackedHost, relativePath, checkedPaths));
}

function assertKnownHost(host: string): HostId {
  if ((hostIds as readonly string[]).includes(host)) {
    return host as HostId;
  }

  throw new Error(`Unknown host "${host}". Supported hosts: ${hostIds.join(', ')}`);
}

function assertAssetBackedHost(host: HostId): AssetBackedHostId {
  if (hostDeclarations[host].assetSupport === 'bundled') {
    return host as AssetBackedHostId;
  }

  throw new Error(
    `Host "${host}" does not ship CLI-managed assets in this stage. Supported asset hosts: ${assetBackedHostIds.join(', ')}`,
  );
}

function wrapMissingAssetError(
  host: string,
  relativePath: string,
  error: unknown,
  options: ResolveHostAssetOptions = {},
): Error {
  if (!isMissingAssetError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const knownHost = assertKnownHost(host);
  const assetBackedHost = assertAssetBackedHost(knownHost);
  const selectedRoot = resolveSelectedHostAssetRoot(options);
  const checkedPaths = [
    resolveHostAssetPath(
      assetBackedHost,
      relativePath,
      path.join(selectedRoot.root, hostDeclarations[assetBackedHost].directory),
    ),
  ];

  return new Error(buildMissingAssetMessage(assetBackedHost, relativePath, checkedPaths));
}

function isMissingAssetError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT',
  );
}

function buildMissingRootMessage(scopeLabel: string, candidates: string[]): string {
  return `Unable to locate ${scopeLabel}. Checked roots: ${candidates.join(', ')}. Rebuild or reinstall corivo if published assets are missing.`;
}

function buildMissingAssetMessage(host: AssetBackedHostId, relativePath: string, checkedPaths: string[]): string {
  return `Missing host asset "${relativePath}" for host "${host}". Checked paths: ${checkedPaths.join(', ')}. Rebuild or reinstall corivo if published assets are missing.`;
}
