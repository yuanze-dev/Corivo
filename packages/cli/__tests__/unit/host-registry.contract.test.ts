import { describe, expect, it } from 'vitest';
import { getHostAdapter } from '../../src/hosts/registry.js';

describe('host registry contract (real helpers)', () => {
  it('does not expose the removed project-claude adapter', async () => {
    expect(getHostAdapter('project-claude')).toBeNull();
  });
});
