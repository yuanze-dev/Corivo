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

  it('exposes adapters with stable display names and capabilities', () => {
    const adapters = getAllHostAdapters();

    for (const adapter of adapters) {
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
    }

    expect(getHostAdapter('project-claude')?.capabilities).toEqual([
      'project-install',
      'rules',
      'doctor',
    ]);
  });

  it('returns structured results from install and doctor', async () => {
    const codex = getHostAdapter('codex');
    const projectClaude = getHostAdapter('project-claude');

    expect(codex).not.toBeNull();
    expect(projectClaude).not.toBeNull();

    const installResult = await codex!.install({});
    const doctorResult = await codex!.doctor({});

    expect(installResult.host).toBe('codex');
    expect(typeof installResult.summary).toBe('string');
    expect(doctorResult.host).toBe('codex');
    expect(Array.isArray(doctorResult.checks)).toBe(true);
    expect(doctorResult.checks.length).toBeGreaterThan(0);
    expect(projectClaude!.capabilities.includes('global-install')).toBe(false);
  });
});
