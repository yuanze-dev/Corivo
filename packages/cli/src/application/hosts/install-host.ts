import { getHostAdapter } from '../../hosts/registry.js';
import type { HostId, HostInstallOptions, HostInstallResult } from '../../hosts/types.js';

export type HostInstallRequest = HostInstallOptions & { host: HostId };

export function createHostInstallUseCase(deps?: {
  run?: (input: HostInstallRequest) => Promise<HostInstallResult>;
}) {
  return async (input: HostInstallRequest): Promise<HostInstallResult> => {
    if (deps?.run) {
      return deps.run(input);
    }

    const adapter = getHostAdapter(input.host);
    if (!adapter) {
      return {
        success: false,
        host: input.host,
        summary: `Unknown host: ${input.host}`,
        error: `Unknown host: ${input.host}`,
      };
    }

    return adapter.install(input);
  };
}
