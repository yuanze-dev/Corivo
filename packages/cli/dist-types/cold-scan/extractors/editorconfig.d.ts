/**
 * EditorConfig 提取器
 * 提取编辑器配置偏好
 */
import type { ScanSource } from '../types.js';
declare function extractEditorconfig(content: string, filePath: string): Promise<{
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
    extractEditorconfig: typeof extractEditorconfig;
};
export default _default;
//# sourceMappingURL=editorconfig.d.ts.map