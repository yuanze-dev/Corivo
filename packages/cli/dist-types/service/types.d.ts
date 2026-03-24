export interface ServiceConfig {
    /** corivo 二进制路径，或 "node /path/to/cli.js" 格式的命令字符串 */
    corivoBin: string;
    dbKey: string;
    dbPath: string;
}
export interface ServiceStatus {
    loaded: boolean;
    running: boolean;
    pid?: number;
}
export interface ServiceResult {
    success: boolean;
    error?: string;
}
/**
 * 后台常驻进程管理器。所有方法不抛出异常，失败通过 ServiceResult.success=false 返回。
 */
export interface ServiceManager {
    install(config: ServiceConfig): Promise<ServiceResult>;
    uninstall(): Promise<ServiceResult>;
    getStatus(): Promise<ServiceStatus>;
    /** 仅供信息查询，不影响路由；start.ts 不检查此方法，直接调用 install() */
    isSupported(): boolean;
}
//# sourceMappingURL=types.d.ts.map