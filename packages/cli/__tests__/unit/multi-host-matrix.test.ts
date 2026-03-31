import { describe, expect, it } from 'vitest';
import {
  createHostAdapterPayload,
  getHostAdapterOutputFormat,
} from '../../src/runtime/host-adapter.js';
import type { HostAdapterCapability } from '../../src/runtime/types.js';

describe('multi-host adapter matrix', () => {
  it('maps Cursor to full-hook behavior', () => {
    const capability: HostAdapterCapability = 'full-hook';

    expect(getHostAdapterOutputFormat(capability)).toBe('hook-text');
    expect(createHostAdapterPayload(capability, 'prompt-submit').runtimeCommand).toBe('query');
  });

  it('maps OpenCode to plugin-transform behavior', () => {
    const capability: HostAdapterCapability = 'plugin-transform';

    expect(getHostAdapterOutputFormat(capability)).toBe('hook-text');
    expect(createHostAdapterPayload(capability, 'response-done').runtimeCommand).toBe('review');
  });

  it('maps Codex to instruction-driven behavior', () => {
    const capability: HostAdapterCapability = 'instruction-driven';

    expect(getHostAdapterOutputFormat(capability)).toBe('text');
    expect(createHostAdapterPayload(capability, 'session-start').runtimeCommand).toBe('carry-over');
  });
});
