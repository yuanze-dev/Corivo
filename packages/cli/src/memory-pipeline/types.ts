import type { MemoryPipelineState } from './pipeline-state.js';

export type PipelineTriggerType = 'init' | 'manual' | 'scheduled';

export interface PipelineTrigger {
  type: PipelineTriggerType;
  requestedBy?: string;
  runAt: number;
  scope?: Record<string, unknown>;
}

export type WorkItemKind = 'session' | 'block' | 'session-job' | 'summary' | 'index-fragment';

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  sourceRef: string;
  freshnessToken?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactDescriptor {
  id: string;
  kind: string;
  version: number;
  path: string;
  source: string;
  createdAt: number;
  upstreamIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactQuery {
  runId?: string;
  source?: string;
  kind?: string;
}

export interface ArtifactWriteInput {
  runId?: string;
  kind: string;
  source: string;
  body: string;
  upstreamIds?: string[];
  metadata?: Record<string, unknown>;
}

export type FinalMemoryFileKind = 'detail' | 'index' | 'all';

export type PipelineStageStatus = 'success' | 'partial' | 'failed' | 'skipped';
export type PipelineStageFailureClassification = 'stage-failed' | 'stage-exception';

export interface PipelineStageResult {
  stageId: string;
  status: PipelineStageStatus;
  inputCount: number;
  outputCount: number;
  artifactIds: string[];
  durationMs?: number;
  failureClassification?: PipelineStageFailureClassification;
  cursor?: string;
  error?: string;
}

export interface MemoryPipelineArtifactStore {
  writeArtifact(input: ArtifactWriteInput): Promise<ArtifactDescriptor>;
  persistDescriptor(descriptor: ArtifactDescriptor): Promise<void>;
  getDescriptor(id: string): Promise<ArtifactDescriptor | undefined>;
  readArtifact(id: string): Promise<string>;
  listArtifacts(query?: ArtifactQuery): Promise<ArtifactDescriptor[]>;
}

export interface MemoryPipelineContext {
  runId: string;
  trigger: PipelineTrigger;
  artifactStore: MemoryPipelineArtifactStore;
  state: MemoryPipelineState;
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    isDebugEnabled?: () => boolean;
  };
}

export interface MemoryPipelineStage {
  id: string;
  run(context: MemoryPipelineContext): Promise<PipelineStageResult>;
}

export type MemoryPipelineId = 'init-memory-pipeline' | 'scheduled-memory-pipeline';

export interface MemoryPipelineDefinition {
  id: MemoryPipelineId;
  stages: MemoryPipelineStage[];
}
