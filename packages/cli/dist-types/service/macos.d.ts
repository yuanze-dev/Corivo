/**
 * macOS launchd 守护进程管理
 */
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js';
export declare class MacOSServiceManager implements ServiceManager {
    isSupported(): boolean;
    install(config: ServiceConfig): Promise<ServiceResult>;
    uninstall(): Promise<ServiceResult>;
    getStatus(): Promise<ServiceStatus>;
}
//# sourceMappingURL=macos.d.ts.map