/**
 * Cold Scan 扫描框架
 * 首次安装时扫描用户本地环境，构建初始画像
 */
import { ScanSource, ScanConfig } from './types.js';
/**
 * 执行 Cold Scan
 */
export declare function coldScan(config?: Partial<ScanConfig>): Promise<{
    blocks: Record<string, unknown>[];
    results: Array<{
        source: string;
        count: number;
        success: boolean;
        error?: string;
    }>;
    totalScanned: number;
    totalFound: number;
}>;
/**
 * 获取所有已注册的扫描源
 */
export declare function getRegisteredSources(): ScanSource[];
/**
 * 注册新的扫描源
 */
export declare function registerSource(source: ScanSource): void;
export * from './types.js';
export * from './utils.js';
//# sourceMappingURL=index.d.ts.map