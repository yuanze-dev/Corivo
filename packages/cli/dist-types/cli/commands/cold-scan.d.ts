/**
 * Cold Scan 命令
 * 首次安装时扫描用户本地环境，构建初始画像
 */
import { Command } from 'commander';
export declare const coldScanCommand: Command;
export declare function coldScanAction(options: {
    verbose?: boolean;
    dryRun?: boolean;
    skip?: string[];
}): Promise<{
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
export default coldScanCommand;
//# sourceMappingURL=cold-scan.d.ts.map