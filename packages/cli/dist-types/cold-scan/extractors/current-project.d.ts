/**
 * Current Project 提取器
 * 提取当前项目信息
 */
import type { ScanSource } from '../types.js';
declare function extractCurrentProject(_content: string, filePath: string): Promise<{
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
    extractCurrentProject: typeof extractCurrentProject;
};
export default _default;
//# sourceMappingURL=current-project.d.ts.map