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

export function isCorivoSurfaceMode(value: string): value is CorivoSurfaceMode {
  return CORIVO_SURFACE_MODES.includes(value as CorivoSurfaceMode);
}

export function isCorivoConfidence(value: string): value is CorivoConfidence {
  return CORIVO_CONFIDENCE_LEVELS.includes(value as CorivoConfidence);
}
