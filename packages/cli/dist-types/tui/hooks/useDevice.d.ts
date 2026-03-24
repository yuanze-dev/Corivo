import type { IdentityConfig } from '../../identity/identity.js';
export interface DeviceInfo {
    identity: IdentityConfig | null;
    hostname: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    dbPath: string;
    configPath: string;
    identityPath: string;
    logPath: string;
}
export declare function useDevice(configDir: string, dbPath: string): DeviceInfo;
//# sourceMappingURL=useDevice.d.ts.map