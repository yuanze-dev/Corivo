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

vi.mock('@/storage/database', () => ({
  CorivoDatabase: {
    getInstance: vi.fn(),
  },
  getConfigDir: () => '/tmp/test-home/.corivo',
  getDefaultDatabasePath: () => '/tmp/test-home/.corivo/corivo.db',
}));

import { createCliContext } from '../../src/cli/context/create-context.js';

describe('createCliContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    appendFile.mockResolvedValue(undefined);
  });

  it('exposes logger, config, paths, fs, clock, output, and db access', () => {
    const context = createCliContext({
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

    expect(context.logger).toBeDefined();
    expect(context.config.load).toBeTypeOf('function');
    expect(context.config.loadSolver).toBeTypeOf('function');
    expect(context.paths.configDir).toBeTypeOf('function');
    expect(context.fs.readJson).toBeTypeOf('function');
    expect(context.fs.writeText).toBeTypeOf('function');
    expect(context.fs.remove).toBeTypeOf('function');
    expect(context.clock.now).toBeTypeOf('function');
    expect(context.output.info).toBeTypeOf('function');
    expect(context.db.get).toBeTypeOf('function');
  });

  it('writes command output into cli.log by default', () => {
    const context = createCliContext({ logLevel: 'debug' });

    context.output.info('hello cli log');

    expect(appendFile).toHaveBeenCalledWith(
      '/tmp/test-home/.corivo/cli.log',
      expect.stringContaining('hello cli log'),
    );
  });

  it('can disable cli.log output explicitly', () => {
    const context = createCliContext({ logLevel: 'debug', fileLog: false });

    context.output.info('do not persist');

    expect(appendFile).not.toHaveBeenCalled();
  });
});
