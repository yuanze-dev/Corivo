export type PipelineTriggerType = 'init' | 'manual' | 'scheduled';

export interface PipelineTrigger {
  type: PipelineTriggerType;
  requestedBy?: string;
  runAt: number;
  scope?: Record<string, unknown>;
}

export type WorkItemKind = 'session' | 'block' | 'summary' | 'index-fragment';

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

export type PipelineStageStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface PipelineStageResult {
  stageId: string;
  status: PipelineStageStatus;
  inputCount: number;
  outputCount: number;
  artifactIds: string[];
  cursor?: string;
  error?: string;
}

export interface MemoryPipelineArtifactStore {
  persistDescriptor(descriptor: ArtifactDescriptor): Promise<void>;
  getDescriptor(id: string): Promise<ArtifactDescriptor | undefined>;
}

export interface MemoryPipelineContext {
  runId: string;
  trigger: PipelineTrigger;
  artifactStore: MemoryPipelineArtifactStore;
  logger?: {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
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
