/**
 * 版本检查器
 * 定期检查新版本并触发更新流程
 */
import type { VersionInfo, UpdateStatus, UpdateConfig, Platform } from './types.js';
/**
 * 获取当前版本
 */
export declare function getCurrentVersion(): string;
/**
 * 获取版本信息（从远程）
 */
export declare function fetchVersionInfo(): Promise<VersionInfo | null>;
/**
 * 检查是否有更新
 */
export declare function checkForUpdate(config?: UpdateConfig): Promise<UpdateStatus>;
/**
 * 执行更新
 */
export declare function performUpdate(versionInfo: VersionInfo, platform: Platform): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * 获取当前平台
 */
export declare function getPlatform(): Platform;
/**
 * 获取更新记录
 */
export declare function getUpdateRecord(): Promise<{
    from?: string;
    to?: string;
    at?: string;
    changelog?: string;
} | null>;
declare const _default: {
    getCurrentVersion: typeof getCurrentVersion;
    fetchVersionInfo: typeof fetchVersionInfo;
    checkForUpdate: typeof checkForUpdate;
    performUpdate: typeof performUpdate;
    getPlatform: typeof getPlatform;
    getUpdateRecord: typeof getUpdateRecord;
};
export default _default;
//# sourceMappingURL=checker.d.ts.map