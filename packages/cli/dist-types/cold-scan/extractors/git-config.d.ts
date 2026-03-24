/**
 * Git Config 提取器
 * 提取用户姓名、邮箱等身份信息
 */
import type { ScanSource } from '../types.js';
declare function extractGitConfig(content: string, filePath: string): Promise<{
    content: string;
    annotation: string;
    source: string;
    vitality: number;
    status: string;
    metadata: {
        scan_source: string | undefined;
        scan_path: string | undefined;
        scanned_at: string;
    };
}[]>;
export declare const source: ScanSource;
declare const _default: {
    source: ScanSource;
    extractGitConfig: typeof extractGitConfig;
};
export default _default;
//# sourceMappingURL=git-config.d.ts.map