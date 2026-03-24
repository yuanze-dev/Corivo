import type { ServiceManager, ServiceConfig, ServiceResult, ServiceStatus } from './types.js';
export declare class UnsupportedServiceManager implements ServiceManager {
    isSupported(): boolean;
    install(_config: ServiceConfig): Promise<ServiceResult>;
    uninstall(): Promise<ServiceResult>;
    getStatus(): Promise<ServiceStatus>;
}
//# sourceMappingURL=unsupported.d.ts.map