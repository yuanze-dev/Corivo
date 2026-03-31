import { describe, expect, it, vi } from 'vitest';
import { createCliContext } from '../../src/cli/context/create-context.js';

describe('createCliContext', () => {
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
});
