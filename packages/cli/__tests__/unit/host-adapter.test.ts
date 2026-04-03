import { describe, expect, it } from 'vitest';
import {
  createHostAdapterPayload,
  getHostAdapterOutputFormat,
} from '../../src/runtime/host-adapter.js';
import type {
  HostAdapterCapability,
  HostAdapterLifecyclePayload,
  HostLifecycleEvent,
} from '../../src/runtime/types.js';

describe('host adapter capability contract', () => {
  it('supports all declared host capability types', () => {
    const capabilities: HostAdapterCapability[] = [
      'full-hook',
      'plugin-transform',
      'instruction-driven',
    ];

    expect(capabilities).toEqual(['full-hook', 'plugin-transform', 'instruction-driven']);
  });
});

describe('createHostAdapterPayload', () => {
  const cases: Array<{
    event: HostLifecycleEvent;
    expectedCommand: HostAdapterLifecyclePayload['runtimeCommand'];
  }> = [
    { event: 'session-start', expectedCommand: 'carry-over' },
    { event: 'prompt-submit', expectedCommand: 'recall' },
    { event: 'response-done', expectedCommand: 'review' },
  ];

  for (const testCase of cases) {
    it(`normalizes ${testCase.event} to ${testCase.expectedCommand}`, () => {
      const payload = createHostAdapterPayload('full-hook', testCase.event);

      expect(payload).toEqual({
        capability: 'full-hook',
        event: testCase.event,
        runtimeCommand: testCase.expectedCommand,
        outputFormat: 'hook-text',
      });
    });
  }
});

describe('getHostAdapterOutputFormat', () => {
  it('uses hook-text for full-hook and plugin-transform hosts', () => {
    expect(getHostAdapterOutputFormat('full-hook')).toBe('hook-text');
    expect(getHostAdapterOutputFormat('plugin-transform')).toBe('hook-text');
  });

  it('uses text for instruction-driven hosts', () => {
    expect(getHostAdapterOutputFormat('instruction-driven')).toBe('text');
  });
});
