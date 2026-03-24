/**
 * SemVer 工具函数
 * 简单的语义化版本比较
 */
/**
 * 解析版本字符串
 */
export declare function parseSemVer(version: string): {
    major: number;
    minor: number;
    patch: number;
} | null;
/**
 * 比较两个版本
 * 返回值: 1 = a > b, 0 = a == b, -1 = a < b
 */
export declare function compareSemVer(a: string, b: string): number;
/**
 * SemVer 类型
 */
export interface SemVer {
    major: number;
    minor: number;
    patch: number;
}
declare const _default: {
    parseSemVer: typeof parseSemVer;
    compareSemVer: typeof compareSemVer;
};
export default _default;
//# sourceMappingURL=semver.d.ts.map