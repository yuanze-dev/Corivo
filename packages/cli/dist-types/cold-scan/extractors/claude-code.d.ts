/**
 * Claude Code 配置提取器
 * 提取 Claude Code 的全局规则、设置、MCP 配置等
 */
import type { ScanSource } from '../types.js';
/**
 * 提取 CLAUDE.md 内容
 */
declare function extractClaudeMd(content: string, filePath: string): Promise<{
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
/**
 * 提取 settings.json
 */
declare function extractSettings(content: string, filePath: string): Promise<{
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
/**
 * 提取 MCP 配置
 */
declare function extractMcpConfig(content: string, filePath: string): Promise<{
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
    extractClaudeMd: typeof extractClaudeMd;
    extractSettings: typeof extractSettings;
    extractMcpConfig: typeof extractMcpConfig;
};
export default _default;
//# sourceMappingURL=claude-code.d.ts.map