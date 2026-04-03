export type HostAssetRootCandidate = {
  root: string;
  source: 'override' | 'package' | 'repo' | 'cache';
};
