import { describe, expect, it, vi, beforeEach } from 'vitest';

const { appendFile, access, readFile, writeFile, unlink, mkdir } = vi.hoisted(() => ({
  appendFile: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    appendFile,
    access,
    readFile,
    writeFile,
    unlink,
    mkdir,
  },
}));

vi.mock('@/infrastructure/storage/facade/database', () => ({
  CorivoDatabase: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@/infrastructure/storage/lifecycle/database-paths.js', () => ({
  getConfigDir: () => '/tmp/test-home/.corivo',
  getDefaultDatabasePath: () => '/tmp/test-home/.corivo/corivo.db',
}));

import {
  createCliLogger,
  createCliOutput,
  getCliConfigDir,
  getCliDatabase,
  getCliDatabasePath,
  getCliHeartbeatPidPath,
  getCliIdentityPath,
  getCliNow,
  getCliSolverPath,
} from '../../src/cli/runtime.js';

describe('cli runtime helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    appendFile.mockResolvedValue(undefined);
  });

  it('exposes modular logger, output, path, clock, and db helpers', () => {
    const logger = createCliLogger({
      logger: {
        log: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        isDebugEnabled: () => false,
      },
    });
    const output = createCliOutput(logger);

    expect(logger).toBeDefined();
    expect(output.info).toBeTypeOf('function');
    expect(getCliConfigDir()).toBe('/tmp/test-home/.corivo');
    expect(getCliDatabasePath()).toBe('/tmp/test-home/.corivo/corivo.db');
    expect(getCliIdentityPath()).toBe('/tmp/test-home/.corivo/identity.json');
    expect(getCliSolverPath()).toBe('/tmp/test-home/.corivo/solver.json');
    expect(getCliHeartbeatPidPath()).toBe('/tmp/test-home/.corivo/heartbeat.pid');
    expect(getCliNow()).toBeTypeOf('number');
    expect(getCliDatabase).toBeTypeOf('function');
  });

  it('writes command output into cli.log by default', () => {
    const output = createCliOutput(createCliLogger({ logLevel: 'debug' }));

    output.info('hello cli log');

    expect(appendFile).toHaveBeenCalledWith(
      '/tmp/test-home/.corivo/cli.log',
      expect.stringContaining('hello cli log'),
    );
  });

  it('can disable cli.log output explicitly', () => {
    const output = createCliOutput(createCliLogger({ logLevel: 'debug', fileLog: false }));

    output.info('do not persist');

    expect(appendFile).not.toHaveBeenCalled();
  });
});
