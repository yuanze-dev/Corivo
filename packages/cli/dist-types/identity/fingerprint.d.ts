/**
 * 平台指纹生成
 *
 * 从各平台提取唯一标识，生成不可逆的用户指纹
 * 用于跨设备识别同一用户
 */
/**
 * 平台类型（可扩展）
 *
 * 设计理念：同一用户在不同设备上会使用相同的工具集合
 * 通过收集多个工具的指纹，交叉验证是同一个人
 */
export type PlatformType = 'claude_code' | 'cursor' | 'codex' | 'opencode' | 'windsurf' | 'copilot' | 'vscode' | 'jetbrains' | 'neovim' | 'github' | 'gitlab' | 'git' | 'npm' | 'yarn' | 'pnpm' | 'bun' | 'docker' | 'podman' | 'feishu' | 'slack' | 'wechat' | 'dingtalk' | 'notion' | 'aws' | 'aliyun' | 'gcp' | 'device' | 'email' | 'custom';
/**
 * 指纹结果
 */
export interface Fingerprint {
    platform: PlatformType;
    value: string;
    method: string;
    confidence: 'high' | 'medium' | 'low';
}
/**
 * 指纹收集器
 */
export declare class FingerprintCollector {
    /**
     * 收集所有可用的平台指纹
     *
     * 对用户完全透明，静默收集所有可用指纹
     *
     * 设计理念：同一用户在不同设备上会使用相同的工具集合
     * 通过收集多个工具的指纹，交叉验证是同一个人
     */
    static collectAll(options?: {
        claudeSettingsPath?: string;
        feishuConfigPath?: string;
    }): Promise<Fingerprint[]>;
    /**
     * 从 Claude Code 提取指纹
     *
     * 读取 ANTHROPIC_AUTH_TOKEN，计算 SHA256 的前 16 位
     *
     * @param settingsPath - Claude Code settings.json 路径
     * @returns 指纹或 null
     */
    static getClaudeCodeFingerprint(settingsPath?: string): Promise<Fingerprint | null>;
    /**
     * 从飞书 MCP 提取指纹
     *
     * @param configPath - 飞书 MCP 配置路径
     * @returns 指纹或 null
     */
    static getFeishuFingerprint(configPath?: string): Promise<Fingerprint | null>;
    /**
     * 从 Cursor 提取指纹
     *
     * Cursor 配置通常在 ~/.cursor/config.json
     */
    static getCursorFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 Codex 提取指纹
     */
    static getCodexFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 OpenCode 提取指纹
     */
    static getOpenCodeFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 Slack 提取指纹
     *
     * Slack 配置可能在多个位置
     */
    static getSlackFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 GitHub 提取指纹
     *
     * 读取 GitHub CLI 或 Git 配置
     */
    static getGitHubFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 VS Code 提取指纹
     *
     * 读取 VS Code 用户设置或机器 ID
     */
    static getVSCodeFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 npm 提取指纹
     *
     * 读取 npm 配置获取唯一标识
     */
    static getNpmFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 Docker 提取指纹
     */
    static getDockerFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 SSH 密钥提取指纹
     *
     * SSH 密钥是跨设备的强身份标识
     */
    static getSSHFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 AWS CLI 提取指纹
     */
    static getAWSFingerprint(): Promise<Fingerprint | null>;
    /**
     * 从 JetBrains IDE 提取指纹
     *
     * 支持 IntelliJ, PyCharm, WebStorm 等
     */
    static getJetBrainsFingerprint(): Promise<Fingerprint | null>;
    /**
     * 生成设备指纹
     *
     * 基于系统信息生成，作为备用指纹
     *
     * @returns 设备指纹
     */
    static getDeviceFingerprint(): Promise<Fingerprint>;
    /**
     * 从字符串生成自定义指纹
     *
     * @param value - 原始值
     * @returns 指纹
     */
    static generateCustomFingerprint(value: string): Fingerprint;
}
/**
 * 指纹匹配器
 *
 * 用于判断两组指纹是否属于同一用户
 */
export declare class FingerprintMatcher {
    /**
     * 检查两组指纹是否有匹配
     *
     * @param fingerprints1 - 第一组指纹
     * @param fingerprints2 - 第二组指纹
     * @returns 是否匹配
     */
    static match(fingerprints1: Fingerprint[], fingerprints2: Fingerprint[]): boolean;
    /**
     * 计算匹配置信度
     *
     * @param fingerprints1 - 第一组指纹
     * @param fingerprints2 - 第二组指纹
     * @returns 置信度 (0-1)
     */
    static matchConfidence(fingerprints1: Fingerprint[], fingerprints2: Fingerprint[]): number;
    /**
     * 获取高置信度指纹
     */
    private static getHighConfidenceFingerprints;
    /**
     * 获取中置信度指纹
     */
    private static getMediumConfidenceFingerprints;
}
/**
 * 指纹序列化
 */
export declare function serializeFingerprints(fingerprints: Fingerprint[]): string;
/**
 * 指纹反序列化
 */
export declare function deserializeFingerprints(data: string): Fingerprint[];
//# sourceMappingURL=fingerprint.d.ts.map