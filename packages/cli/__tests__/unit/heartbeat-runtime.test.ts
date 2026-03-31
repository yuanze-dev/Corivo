import { describe, expect, it, vi } from 'vitest';
import { Heartbeat } from '../../src/engine/heartbeat.js';
import type { Logger } from '../../src/utils/logging.js';

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isDebugEnabled: () => false,
  };
}

describe('Heartbeat runtime dependencies', () => {
  it('uses the injected logger facade for plugin lifecycle logs', async () => {
    const logger = createMockLogger();
    const heartbeat = new Heartbeat({ logger });

    await expect(
      heartbeat.loadPlugins(['nonexistent-pkg-xyz-abc-12345'])
    ).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalled();
  });
});
