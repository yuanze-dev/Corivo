import type { RawSessionJobSource, SessionJobWorkItem } from './sources/raw-session-job-source.js';
import type { ClaudeSessionWorkItem } from './sources/claude-session-source.js';

export type RawSessionJobCompletionHook = Pick<RawSessionJobSource, 'markSucceeded' | 'markFailed'>;

export interface ExtractedRawMemoryRunState {
  sessionId: string;
  artifactId: string;
}

export interface MergedFinalOutputRunState {
  files: string[];
  artifactId?: string;
}

export interface MemoryIndexRefreshRunState {
  stageId: string;
  indexCount: number;
  artifactId?: string;
  refreshedAt: number;
}

export type CollectedSessionWorkItem = ClaudeSessionWorkItem;

export interface MemoryPipelineState {
  rawSessionJobs: {
    claimed: SessionJobWorkItem[];
    source?: RawSessionJobCompletionHook;
    succeededJobIds: Set<string>;
  };
  collectedSessions: CollectedSessionWorkItem[];
  extractedRawMemories: ExtractedRawMemoryRunState[];
  mergedFinalOutputs: MergedFinalOutputRunState;
  indexRefresh?: MemoryIndexRefreshRunState;
}

export function createMemoryPipelineState(): MemoryPipelineState {
  return {
    rawSessionJobs: {
      claimed: [],
      source: undefined,
      succeededJobIds: new Set<string>(),
    },
    collectedSessions: [],
    extractedRawMemories: [],
    mergedFinalOutputs: {
      files: [],
    },
    indexRefresh: undefined,
  };
}

export function setClaimedRawSessionJobs(
  state: MemoryPipelineState,
  input: { jobs: SessionJobWorkItem[]; source?: RawSessionJobCompletionHook },
): void {
  state.rawSessionJobs.claimed = input.jobs;
  state.rawSessionJobs.source = input.source;
  state.rawSessionJobs.succeededJobIds.clear();
}

export function getClaimedRawSessionJobs(state: MemoryPipelineState): SessionJobWorkItem[] {
  return state.rawSessionJobs.claimed;
}

export function getPendingClaimedRawSessionJobs(state: MemoryPipelineState): SessionJobWorkItem[] {
  return state.rawSessionJobs.claimed.filter(
    (job) => !state.rawSessionJobs.succeededJobIds.has(job.job.id),
  );
}

export function markRawSessionJobSucceeded(state: MemoryPipelineState, jobId: string): void {
  state.rawSessionJobs.succeededJobIds.add(jobId);
}

export function getRawSessionJobCompletionHook(
  state: MemoryPipelineState,
): RawSessionJobCompletionHook | undefined {
  return state.rawSessionJobs.source;
}

export function setCollectedSessions(
  state: MemoryPipelineState,
  sessions: CollectedSessionWorkItem[],
): void {
  state.collectedSessions = sessions;
}

export function recordExtractedRawMemory(
  state: MemoryPipelineState,
  memory: ExtractedRawMemoryRunState,
): void {
  state.extractedRawMemories.push(memory);
}

export function setMergedFinalOutputs(
  state: MemoryPipelineState,
  output: MergedFinalOutputRunState,
): void {
  state.mergedFinalOutputs = output;
}

export function setIndexRefreshMetadata(
  state: MemoryPipelineState,
  metadata: MemoryIndexRefreshRunState,
): void {
  state.indexRefresh = metadata;
}
