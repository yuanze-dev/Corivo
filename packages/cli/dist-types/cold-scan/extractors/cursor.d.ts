/**
 * Cursor 配置提取器
 * 提取 Cursor 的 AI 规则
 */
import type { ScanSource } from '../types.js';
/**
 * 提取 .cursorrules 文件
 */
declare function extractCursorRules(content: string, filePath: string): Promise<{
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
    extractCursorRules: typeof extractCursorRules;
};
export default _default;
//# sourceMappingURL=cursor.d.ts.map