/**
 * Cold Scan type definitions.
 * Used on first install to scan the user's local environment and build an initial profile.
 */

/**
 * Defines a single scan source.
 */
export interface ScanSource {
  /** Source name identifier */
  name: string;
  /** File path (supports ~ expansion) or a function that returns paths */
  path: string | (() => string[]) | (() => Promise<string[]>);
  /** Extractor: derives blocks from file content */
  extractor: (content: string, filePath: string) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
  /** Priority — higher values are scanned first */
  priority: number;
  /** Per-source timeout in milliseconds */
  timeout: number;
}

/**
 * Result for a single scan source.
 */
export interface ScanResult {
  /** Source name identifier */
  source: string;
  /** Path of the scanned file */
  path: string;
  /** Number of blocks extracted */
  count: number;
  /** Whether the scan succeeded */
  success: boolean;
  /** Error message if the scan failed */
  error?: string;
}

/**
 * Configuration for a cold scan run.
 */
export interface ScanConfig {
  /** Total timeout for the entire scan in milliseconds */
  totalTimeout: number;
  /** Whether to print verbose output */
  verbose: boolean;
  /** List of source names to skip */
  skipSources: string[];
}

/**
 * Default scan configuration.
 */
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  totalTimeout: 15_000, // 15 seconds
  verbose: false,
  skipSources: [],
};
