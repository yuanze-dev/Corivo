import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, loadSolverConfig, saveSolverConfig } from '@/config';
import { CorivoDatabase, getConfigDir, getDefaultDatabasePath } from '@/storage/database';
import { createLogger, resolveRuntimeLogLevel, type LogTarget } from '@/utils/logging';
import type { CliContext, CreateCliContextOptions } from './types.js';

export function createCliContext(options: CreateCliContextOptions = {}): CliContext {
  const logTarget = options.logTarget ?? createCliLogTarget(options.fileLog !== false);
  const logger = options.logger ?? createLogger(
    logTarget,
    resolveRuntimeLogLevel({
      explicitLogLevel: options.logLevel,
      configLogLevel: options.configLogLevel,
    }),
  );

  return {
    logger,
    config: {
      load: loadConfig,
      loadSolver: loadSolverConfig,
      saveSolver: saveSolverConfig,
    },
    paths: {
      configDir: () => getConfigDir(),
      databasePath: () => getDefaultDatabasePath(),
      identityPath: () => path.join(getConfigDir(), 'identity.json'),
      solverPath: () => path.join(getConfigDir(), 'solver.json'),
      heartbeatPidPath: () => path.join(getConfigDir(), 'heartbeat.pid'),
    },
    fs: {
      exists: async (filePath) => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      readJson: async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf-8')),
      writeJson: async (filePath, value) => {
        await fs.writeFile(filePath, JSON.stringify(value, null, 2));
      },
      writeText: async (filePath, value) => {
        await fs.writeFile(filePath, value);
      },
      remove: async (filePath) => {
        await fs.unlink(filePath);
      },
    },
    clock: {
      now: () => Date.now(),
    },
    output: {
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
      success: (...args) => logger.success(...args),
    },
    db: {
      get: ({ path: dbPath, enableEncryption } = {}) => {
        return CorivoDatabase.getInstance({
          path: dbPath ?? getDefaultDatabasePath(),
          enableEncryption,
        });
      },
    },
  };
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
