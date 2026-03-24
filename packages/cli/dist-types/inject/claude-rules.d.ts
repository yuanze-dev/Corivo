/**
 * CLAUDE.md 规则注入模块
 *
 * 自动将 Corivo 规则注入到项目的 CLAUDE.md 文件
 */
/**
 * 标准规则模板
 */
export declare const CORIVO_RULES: string;
/**
 * 检查文件是否已包含 Corivo 规则
 */
export declare function hasCorivoRules(filePath: string): Promise<boolean>;
/**
 * 注入规则到文件
 */
export declare function injectRules(filePath: string, options?: {
    force?: boolean;
}): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * 移除规则从文件
 */
export declare function ejectRules(filePath: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * 注入到全局 CLAUDE.md
 */
export declare function injectGlobalRules(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
}>;
/**
 * 注入到当前项目 CLAUDE.md
 */
export declare function injectProjectRules(projectPath?: string): Promise<{
    success: boolean;
    path?: string;
    error?: string;
}>;
declare const _default: {
    hasCorivoRules: typeof hasCorivoRules;
    injectRules: typeof injectRules;
    ejectRules: typeof ejectRules;
    injectGlobalRules: typeof injectGlobalRules;
    injectProjectRules: typeof injectProjectRules;
};
export default _default;
//# sourceMappingURL=claude-rules.d.ts.map