import type { RawSessionJobSource, SessionJobWorkItem } from './sources/raw-session-job-source.js';

export const RAW_SESSION_JOBS_STATE_KEY = 'rawSessionJobs';
export const RAW_SESSION_JOB_SOURCE_STATE_KEY = 'rawSessionJobSource';

export function getRawSessionJobs(state: Map<string, unknown>): SessionJobWorkItem[] {
  const value = state.get(RAW_SESSION_JOBS_STATE_KEY);
  return Array.isArray(value) ? (value as SessionJobWorkItem[]) : [];
}

export function getRawSessionJobSource(
  state: Map<string, unknown>,
): RawSessionJobSource | undefined {
  const value = state.get(RAW_SESSION_JOB_SOURCE_STATE_KEY);
  return value as RawSessionJobSource | undefined;
}
