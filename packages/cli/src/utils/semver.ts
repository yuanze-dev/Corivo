/**
 * Minimal Semantic Versioning utilities used by the update checker.
 * This module intentionally supports only numeric major/minor/patch segments.
 */

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)/;
const SEMVER_PARTS = ['major', 'minor', 'patch'] as const;

/**
 * Parsed semantic version components.
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parses a semantic version string into numeric components.
 * Accepts an optional leading "v" prefix.
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(SEMVER_PATTERN);
  if (!match) return null;

  const [, major, minor, patch] = match;

  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

/**
 * Compares two semantic version strings.
 * Returns 1 when `a` is newer, -1 when `b` is newer, and 0 when equal
 * or when either input cannot be parsed by this module.
 */
export function compareSemVer(a: string, b: string): number {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);

  if (!va || !vb) return 0;

  for (const part of SEMVER_PARTS) {
    if (va[part] !== vb[part]) {
      return va[part] > vb[part] ? 1 : -1;
    }
  }

  return 0;
}

export default { parseSemVer, compareSemVer };
