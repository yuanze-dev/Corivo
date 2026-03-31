import { getHostAdapter } from '../../hosts/registry.js';
import type { HostDoctorResult, HostId, HostInstallOptions } from '../../hosts/types.js';

export type HostDoctorRequest = HostInstallOptions & { host: HostId };

export function createHostDoctorUseCase(deps?: {
  run?: (input: HostDoctorRequest) => Promise<HostDoctorResult>;
}) {
  return async (input: HostDoctorRequest): Promise<HostDoctorResult> => {
    if (deps?.run) {
      return deps.run(input);
    }

    const adapter = getHostAdapter(input.host);
    if (!adapter) {
      return {
        ok: false,
        host: input.host,
        checks: [
          {
            label: 'adapter',
            ok: false,
            detail: `Unknown host: ${input.host}`,
          },
        ],
      };
    }

    return adapter.doctor(input);
  };
}
