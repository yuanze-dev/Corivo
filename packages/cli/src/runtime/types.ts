export const CORIVO_SURFACE_MODES = [
  'carry_over',
  'recall',
  'challenge',
  'uncertain',
  'review',
] as const;

export type CorivoSurfaceMode = (typeof CORIVO_SURFACE_MODES)[number];

export const CORIVO_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export type CorivoConfidence = (typeof CORIVO_CONFIDENCE_LEVELS)[number];

export interface CorivoSurfaceItem {
  mode: CorivoSurfaceMode;
  confidence: CorivoConfidence;
  whyNow: string;
  claim: string;
  evidence: string[];
  memoryIds: string[];
  suggestedAction?: string;
}

export const HOST_ADAPTER_CAPABILITIES = [
  'full-hook',
  'plugin-transform',
  'instruction-driven',
] as const;

export type HostAdapterCapability = (typeof HOST_ADAPTER_CAPABILITIES)[number];

export const HOST_LIFECYCLE_EVENTS = [
  'session-start',
  'prompt-submit',
  'response-done',
] as const;

export type HostLifecycleEvent = (typeof HOST_LIFECYCLE_EVENTS)[number];

export interface HostAdapterLifecyclePayload {
  capability: HostAdapterCapability;
  event: HostLifecycleEvent;
  runtimeCommand: 'carry-over' | 'recall' | 'review';
  outputFormat: 'text' | 'json' | 'hook-text';
}

export function isCorivoSurfaceMode(value: string): value is CorivoSurfaceMode {
  return CORIVO_SURFACE_MODES.includes(value as CorivoSurfaceMode);
}

export function isCorivoConfidence(value: string): value is CorivoConfidence {
  return CORIVO_CONFIDENCE_LEVELS.includes(value as CorivoConfidence);
}
