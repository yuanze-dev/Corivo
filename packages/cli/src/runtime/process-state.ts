export interface ProcessRuntimeState {
  runId?: string;
  sessionId?: string;
  startedAt?: number;
}

let processRuntimeState: ProcessRuntimeState = {};

export function getProcessRuntimeState(): ProcessRuntimeState {
  return { ...processRuntimeState };
}

export function updateProcessRuntimeState(
  patch: ProcessRuntimeState,
): ProcessRuntimeState {
  processRuntimeState = {
    ...processRuntimeState,
    ...patch,
  };

  return getProcessRuntimeState();
}

export function resetProcessRuntimeState(): void {
  processRuntimeState = {};
}
