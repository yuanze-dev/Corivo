export const hostDeclarations = {
  'claude-code': {
    directory: 'claude-code',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/claude-code',
  },
  codex: {
    directory: 'codex',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/codex',
  },
  cursor: {
    directory: 'cursor',
    assetSupport: 'bundled',
    packageName: '@corivo-ai/cursor',
  },
  opencode: {
    directory: 'opencode',
    assetSupport: 'none',
    packageName: '@corivo-ai/opencode',
  },
} as const;

export type HostId = keyof typeof hostDeclarations;

export const hostIds = Object.keys(hostDeclarations) as HostId[];

export const assetBackedHostIds = hostIds.filter(
  (host): host is AssetBackedHostId => hostDeclarations[host].assetSupport === 'bundled',
);

export type AssetBackedHostId = {
  [K in HostId]: (typeof hostDeclarations)[K]['assetSupport'] extends 'bundled' ? K : never
}[HostId];
