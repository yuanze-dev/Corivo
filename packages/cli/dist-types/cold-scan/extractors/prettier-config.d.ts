/**
 * Prettier Config 提取器
 * 提取代码风格偏好
 */
import type { ScanSource } from '../types.js';
declare function extractPrettierConfig(content: string, filePath: string): Promise<{
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
    extractPrettierConfig: typeof extractPrettierConfig;
};
export default _default;
//# sourceMappingURL=prettier-config.d.ts.map