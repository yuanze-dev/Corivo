/**
 * Linux systemd --user 守护进程管理
 */
import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js';
export declare class LinuxServiceManager implements ServiceManager {
    isSupported(): boolean;
    install(config: ServiceConfig): Promise<ServiceResult>;
    uninstall(): Promise<ServiceResult>;
    getStatus(): Promise<ServiceStatus>;
}
//# sourceMappingURL=linux.d.ts.map