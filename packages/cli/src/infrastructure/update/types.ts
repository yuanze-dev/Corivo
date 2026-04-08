/**
 * Automatically update system type definitions
 */

/**
 * Platform identification
 */
export type Platform = 'Darwin-arm64' | 'Darwin-x64' | 'Linux-x64';

/**
 * Version information
 */
export interface VersionInfo {
  /** version number */
  version: string;
  /** Release time */
  released_at: string;
  /** Are there any breaking changes? */
  breaking: boolean;
  /** Change log */
  changelog: string;
  /** Binary packages for each platform (old binary update link reserved fields) */
  binaries?: Record<Platform, BinaryInfo>;
}

/**
 * Binary package information
 */
export interface BinaryInfo {
  /** Download URL */
  url: string;
  /** SHA256 checksum */
  checksum: string;
  /** File size (bytes) */
  size?: number;
}

/**
 * Update configuration
 */
export interface UpdateConfig {
  /** Whether to enable automatic updates */
  auto?: boolean;
  /** Fixed version (such as "0.10.x") */
  pin?: string;
  /** Check interval (milliseconds) */
  checkInterval?: number;
}

/**
 * update status
 */
export interface UpdateStatus {
  /** Current version */
  currentVersion: string;
  /** latest version */
  latestVersion: string | null;
  /** Is there an update available? */
  hasUpdate: boolean;
  /** Is it a destructive update? */
  isBreaking: boolean;
  /** Last check time */
  lastCheck: number | null;
  /** Next inspection time */
  nextCheck: number | null;
}

/**
 * Update results
 */
export interface UpdateResult {
  /** Is it successful? */
  success: boolean;
  /** Which version to update from */
  from?: string;
  /** Which version to update to */
  to?: string;
  /** Update time */
  at?: string;
  /** Change log */
  changelog?: string;
  /** error message */
  error?: string;
}

/**
 * version.json structure
 */
export interface VersionJson {
  version: string;
  released_at: string;
  breaking: boolean;
  changelog: string;
  binaries?: Record<Platform, BinaryInfo>;
}
