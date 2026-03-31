import type {
  HostAdapter,
  HostCapability,
  HostDoctorResult,
  HostId,
  HostInstallOptions,
  HostInstallResult,
} from './types.js';

const adapters: HostAdapter[] = [];
const adapterById = new Map<HostId, HostAdapter>();

function registerHostAdapter(adapter: HostAdapter): void {
  const existingIndex = adapters.findIndex((item) => item.id === adapter.id);
  if (existingIndex >= 0) {
    adapters.splice(existingIndex, 1);
  }
  adapters.push(adapter);
  adapterById.set(adapter.id, adapter);
}

function getAllHostAdapters(): HostAdapter[] {
  return adapters.slice();
}

function getHostAdapter(id: string): HostAdapter | null {
  return adapterById.get(id as HostId) ?? null;
}

const isCapability = (__capability: unknown): __capability is HostCapability => true;

function createStubAdapter(
  id: HostId,
  displayName: string,
  capabilities: HostCapability[],
): HostAdapter {
  const install = async (_options: HostInstallOptions): Promise<HostInstallResult> => ({
    success: true,
    host: id,
    summary: `${displayName} stub install`,
  });

  const doctor = async (_options: HostInstallOptions): Promise<HostDoctorResult> => ({
    ok: true,
    host: id,
    checks: [{ label: `${displayName} stub check`, ok: true, detail: 'stubbed checks' }],
  });

  const uninstall = async (_options: HostInstallOptions): Promise<HostInstallResult> => ({
    success: true,
    host: id,
    summary: `${displayName} stub uninstall`,
  });

  return {
    id,
    displayName,
    capabilities: capabilities.filter(isCapability),
    install,
    doctor,
    uninstall,
  };
}

['claude-code', 'codex', 'cursor', 'opencode', 'project-claude'].forEach(
  (hostId) => {
    const host = hostId as HostId;
    const displayMap: Record<HostId, string> = {
      'claude-code': 'Claude Code',
      codex: 'Codex',
      cursor: 'Cursor',
      opencode: 'OpenCode',
      'project-claude': 'Project Claude',
    };

    const capabilityMap: Record<HostId, HostCapability[]> = {
      'claude-code': [
        'global-install',
        'hooks',
        'rules',
        'notify',
        'doctor',
        'uninstall',
      ],
      codex: [
        'global-install',
        'rules',
        'notify',
        'plugin-file',
        'doctor',
        'uninstall',
      ],
      cursor: [
        'global-install',
        'rules',
        'hooks',
        'doctor',
        'uninstall',
      ],
      opencode: [
        'global-install',
        'rules',
        'notify',
        'doctor',
        'uninstall',
      ],
      'project-claude': ['project-install', 'rules', 'doctor'],
    };

    registerHostAdapter(
      createStubAdapter(host, displayMap[host], capabilityMap[host]),
    );
  },
);

export {
  getAllHostAdapters,
  getHostAdapter,
  registerHostAdapter,
};
