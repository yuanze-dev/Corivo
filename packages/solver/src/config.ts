import os from 'node:os';
import path from 'node:path';

export const config = {
  port: parseInt(process.env.SOLVER_PORT ?? '3141', 10),
  host: process.env.SOLVER_HOST ?? '127.0.0.1',
  dbPath: process.env.SOLVER_DB_PATH ?? path.join(os.homedir(), '.corivo', 'solver.db'),
  tokenTtlMs: 60 * 60 * 1000,       // 1 hour
  challengeTtlMs: 5 * 60 * 1000,    // 5 minutes
  pbkdf2Iterations: 100_000,
  version: '0.1.0',
};
