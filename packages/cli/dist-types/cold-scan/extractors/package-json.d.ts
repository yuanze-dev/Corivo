/**
 * package.json 提取器
 * 扫描最近项目，提取技术栈信息
 */
import type { ScanSource } from '../types.js';
declare function extractPackageJson(content: string, filePath: string): Promise<{
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
    extractPackageJson: typeof extractPackageJson;
};
export default _default;
//# sourceMappingURL=package-json.d.ts.map