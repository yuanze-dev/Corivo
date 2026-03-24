/**
 * Cold Scan 工具函数
 */
/**
 * 展开路径中的 ~ 为用户主目录
 */
export declare function expandHome(filePath: string): string;
/**
 * 检查文件是否存在
 */
export declare function fileExists(filePath: string): Promise<boolean>;
/**
 * 读取文件内容（忽略不存在的文件）
 */
export declare function readFileSafe(filePath: string): Promise<string | null>;
/**
 * 读取 JSON 文件（忽略解析错误）
 */
export declare function readJsonSafe<T = unknown>(filePath: string): Promise<T | null>;
/**
 * 在当前目录及上级目录查找文件
 */
export declare function findFileInParents(fileName: string, maxLevels?: number): Promise<string | null>;
/**
 * 查找用户主目录下的文件（支持多个位置）
 */
export declare function findFilesInHome(patterns: string[]): Promise<string[]>;
/**
 * 使用 glob 查找文件
 */
export declare function globFiles(pattern: string, options?: {
    cwd?: string;
    maxResults?: number;
}): Promise<string[]>;
/**
 * 获取最近修改的 Git 项目
 */
export declare function getRecentGitProjects(maxCount?: number): Promise<string[]>;
/**
 * 安全路径：永不扫描的敏感文件路径
 */
export declare const NEVER_SCAN_PATTERNS: string[];
/**
 * 检查路径是否应该被跳过
 */
export declare function shouldSkipPath(filePath: string): boolean;
/**
 * 创建 block 的辅助函数
 */
export interface CreateBlockOptions {
    content: string;
    annotation: string;
    source?: string;
    filePath?: string;
    metadata?: Record<string, unknown>;
}
export declare function createBlock(options: CreateBlockOptions): {
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
};
//# sourceMappingURL=utils.d.ts.map