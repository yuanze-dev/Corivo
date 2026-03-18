/**
 * Claude Code 采集器
 *
 * 注入 Corivo 规则到 CLAUDE.md
 */
export declare class ClaudeCodeIngestor {
    /**
     * 注入规则到 CLAUDE.md
     *
     * @param projectPath - 项目路径
     */
    injectRules(projectPath: string): Promise<void>;
    /**
     * 生成规则模板
     */
    private generateRules;
    /**
     * 读取对话历史（未来功能）
     */
    readConversationHistory(): Promise<string[]>;
}
//# sourceMappingURL=claude-code.d.ts.map