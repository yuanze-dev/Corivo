import { describe, expect, it } from 'vitest';
import { getAllHostAdapters, getHostAdapter } from '../../src/hosts/registry.js';

describe('host registry', () => {
  it('exposes builtin host adapters by stable id', () => {
    const adapters = getAllHostAdapters();
    expect(adapters.map((item) => item.id)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'opencode',
      'project-claude',
    ]);
  });

  it('returns a single adapter by id', () => {
    expect(getHostAdapter('codex')?.id).toBe('codex');
    expect(getHostAdapter('missing')).toBeNull();
  });
});
