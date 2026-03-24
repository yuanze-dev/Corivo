/**
 * docker-compose 提取器
 * 提取基础设施偏好
 */
import type { ScanSource } from '../types.js';
declare function extractDockerCompose(content: string, filePath: string): Promise<{
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
    extractDockerCompose: typeof extractDockerCompose;
};
export default _default;
//# sourceMappingURL=docker-compose.d.ts.map