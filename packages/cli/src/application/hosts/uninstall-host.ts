import { getHostAdapter } from '../../hosts/registry.js';
import type { HostId, HostInstallOptions, HostInstallResult } from '../../hosts/types.js';

export type HostUninstallRequest = HostInstallOptions & { host: HostId };

export function createHostUninstallUseCase(deps?: {
  run?: (input: HostUninstallRequest) => Promise<HostInstallResult>;
}) {
  return async (input: HostUninstallRequest): Promise<HostInstallResult> => {
    if (deps?.run) {
      return deps.run(input);
    }

    const adapter = getHostAdapter(input.host);
    if (!adapter?.uninstall) {
      return {
        success: false,
        host: input.host,
        summary: `Uninstall not supported for host: ${input.host}`,
        error: `Uninstall not supported for host: ${input.host}`,
      };
    }

    return adapter.uninstall(input);
  };
}
