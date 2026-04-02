import type { CorivoConfig, SolverConfig } from '../../config.js';
import type { CorivoDatabase } from '@/storage/database';
import type { Logger, LogTarget } from '../../utils/logging.js';

/**
 * Shared runtime capabilities for CLI commands and services.
 *
 * Keep this limited to horizontal runtime concerns such as logging,
 * config access, path resolution, clock, output, and database access.
 * Do not place business actions like sync orchestration into this object.
 */
export interface CliPaths {
  configDir(): string;
  databasePath(): string;
  identityPath(): string;
  solverPath(): string;
  heartbeatPidPath(): string;
}

export interface CliFs {
  exists(filePath: string): Promise<boolean>;
  readJson<T>(filePath: string): Promise<T>;
  writeJson(filePath: string, value: unknown): Promise<void>;
  writeText(filePath: string, value: string): Promise<void>;
  remove(filePath: string): Promise<void>;
}

export interface CliConfigAccess {
  load(configDir?: string): Promise<CorivoConfig | null>;
  loadSolver(configDir?: string): Promise<SolverConfig | null>;
  saveSolver(config: SolverConfig, configDir?: string): Promise<void>;
}

export interface CliClock {
  now(): number;
}

export interface CliOutput {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export interface CliDbAccess {
  get(options?: { path?: string; enableEncryption?: boolean }): CorivoDatabase;
}

export interface CliContext {
  logger: Logger;
  config: CliConfigAccess;
  paths: CliPaths;
  fs: CliFs;
  clock: CliClock;
  output: CliOutput;
  db: CliDbAccess;
}

export interface CreateCliContextOptions {
  logger?: Logger;
  logLevel?: string;
  configLogLevel?: string;
  logTarget?: LogTarget;
  fileLog?: boolean;
}
