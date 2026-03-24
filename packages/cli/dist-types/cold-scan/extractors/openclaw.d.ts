/**
 * OpenClaw 配置提取器
 * 提取 OpenClaw AI 助手的配置、模型偏好、通道、技能等信息
 */
import type { ScanSource } from '../types.js';
/**
 * 提取主配置文件
 */
declare function extractConfig(content: string, filePath: string): Promise<{
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
 * 提取 AGENTS.md（行为规则）
 */
declare function extractAgentsMd(content: string, filePath: string): Promise<{
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
 * 提取 SOUL.md（AI 个性）
 */
declare function extractSoulMd(content: string, filePath: string): Promise<{
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
    extractConfig: typeof extractConfig;
    extractAgentsMd: typeof extractAgentsMd;
    extractSoulMd: typeof extractSoulMd;
};
export default _default;
//# sourceMappingURL=openclaw.d.ts.map