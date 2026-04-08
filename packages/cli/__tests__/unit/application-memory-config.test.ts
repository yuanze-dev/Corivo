import { describe, expect, it, vi, beforeEach } from 'vitest';

const { readFile } = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile,
  },
}));

import { ConfigError } from '../../src/domain/errors/index.js';
import { readMemoryPipelineConfig } from '../../src/application/memory/config.js';

describe('readMemoryPipelineConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws a ConfigError when config.json is missing', async () => {
    readFile.mockRejectedValueOnce({ code: 'ENOENT' });

    await expect(readMemoryPipelineConfig('/tmp/corivo')).rejects.toThrow(ConfigError);
  });

  it('rejects legacy encrypted_db_key config', async () => {
    readFile.mockResolvedValueOnce(JSON.stringify({ encrypted_db_key: 'legacy-key' }));

    await expect(readMemoryPipelineConfig('/tmp/corivo')).rejects.toThrow(
      'Detected a legacy password-based config.',
    );
  });
});
