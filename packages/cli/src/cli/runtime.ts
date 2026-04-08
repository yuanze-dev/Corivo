import fs from 'node:fs/promises';
import path from 'node:path';
import type { CorivoConfig, SolverConfig } from '@/config';
import { loadConfig, loadSolverConfig, saveSolverConfig } from '@/config';
import { getConfigDir, getDefaultDatabasePath } from '@/infrastructure/storage/lifecycle/database-paths.js';
import { CorivoDatabase, openCorivoDatabase } from '@/infrastructure/storage/lifecycle/database.js';
import {
  createLogger,
  resolveRuntimeLogLevel,
  type Logger,
  type LogLevel,
  type LogTarget,
} from '@/utils/logging';

export interface CliRuntimeOptions {
  logger?: Logger;
  logLevel?: LogLevel | string | null;
  configLogLevel?: LogLevel | string | null;
  logTarget?: LogTarget;
  fileLog?: boolean;
}

export interface CliOutput {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export function createCliLogger(options: CliRuntimeOptions = {}): Logger {
  if (options.logger) {
    return options.logger;
  }

  const logTarget = options.logTarget ?? createCliLogTarget(options.fileLog !== false);
  return createLogger(
    logTarget,
    resolveRuntimeLogLevel({
      explicitLogLevel: options.logLevel,
      configLogLevel: options.configLogLevel,
    }),
  );
}

export function createConfiguredCliLogger(
  config: CorivoConfig | null | undefined,
  options: CliRuntimeOptions = {},
): Logger {
  return createCliLogger({
    ...options,
    configLogLevel: config?.settings?.logLevel,
  });
}

export function createCliOutput(logger: Logger): CliOutput {
  return {
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
    success: (...args) => logger.success(...args),
  };
}

export function getCliOutput(options: CliRuntimeOptions = {}): CliOutput {
  return createCliOutput(createCliLogger(options));
}

export function getConfiguredCliOutput(
  config: CorivoConfig | null | undefined,
  options: CliRuntimeOptions = {},
): CliOutput {
  return createCliOutput(createConfiguredCliLogger(config, options));
}

export function getCliConfigDir(): string {
  return getConfigDir();
}

export function getCliDatabasePath(): string {
  return getDefaultDatabasePath();
}

export function getCliIdentityPath(): string {
  return path.join(getConfigDir(), 'identity.json');
}

export function getCliSolverPath(): string {
  return path.join(getConfigDir(), 'solver.json');
}

export function getCliHeartbeatPidPath(): string {
  return path.join(getConfigDir(), 'heartbeat.pid');
}

export async function loadCliConfig(configDir?: string): Promise<CorivoConfig | null> {
  return loadConfig(configDir);
}

export async function loadCliSolver(configDir?: string): Promise<SolverConfig | null> {
  return loadSolverConfig(configDir);
}

export async function saveCliSolver(config: SolverConfig, configDir?: string): Promise<void> {
  await saveSolverConfig(config, configDir);
}

export function getCliDatabase(options: { path?: string; enableEncryption?: boolean } = {}): CorivoDatabase {
  return openCorivoDatabase({
    path: options.path ?? getDefaultDatabasePath(),
    enableEncryption: options.enableEncryption,
  });
}

export async function cliFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readCliJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
}

export async function writeCliJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

export async function writeCliText(filePath: string, value: string): Promise<void> {
  await fs.writeFile(filePath, value);
}

export async function removeCliFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

export function getCliNow(): number {
  return Date.now();
}

function createCliLogTarget(fileLogEnabled: boolean): LogTarget {
  const cliLogPath = path.join(getConfigDir(), 'cli.log');

  const write = (method: 'log' | 'error', args: unknown[]) => {
    console[method](...args);
    if (!fileLogEnabled) {
      return;
    }

    const line = `${args.map((value) => String(value)).join(' ')}\n`;
    void fs.appendFile(cliLogPath, line).catch(() => {});
  };

  return {
    log: (...args) => write('log', args),
    error: (...args) => write('error', args),
  };
}
