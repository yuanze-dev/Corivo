import { describe, expect, it, vi } from 'vitest';
import { createConfiguredCliLogger } from '../../src/cli/runtime.js';
import type { CorivoConfig } from '../../src/config.js';
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

describe('createConfiguredCliLogger', () => {
  it('reuses the provided logger facade while applying config logLevel', () => {
    const logger = createMockLogger();
    const config = {
      version: '1',
      created_at: '2026-04-01T00:00:00.000Z',
      identity_id: 'id-123',
      settings: {
        logLevel: 'debug',
      },
    } satisfies CorivoConfig;

    const configuredLogger = createConfiguredCliLogger(config, { logger });

    expect(configuredLogger).toBe(logger);
  });
});
