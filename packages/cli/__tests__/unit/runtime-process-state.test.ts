import { beforeEach, describe, expect, it } from 'vitest';
import {
  getProcessRuntimeState,
  resetProcessRuntimeState,
  updateProcessRuntimeState,
} from '../../src/runtime/process-state.js';

describe('process runtime state', () => {
  beforeEach(() => {
    resetProcessRuntimeState();
  });

  it('stores process-scoped metadata in a singleton registry', () => {
    updateProcessRuntimeState({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });

    expect(getProcessRuntimeState()).toEqual({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });
  });

  it('merges updates instead of replacing the entire runtime state', () => {
    updateProcessRuntimeState({
      runId: 'run-123',
      startedAt: 1000,
    });

    updateProcessRuntimeState({
      sessionId: 'session-456',
    });

    expect(getProcessRuntimeState()).toEqual({
      runId: 'run-123',
      sessionId: 'session-456',
      startedAt: 1000,
    });
  });
});
