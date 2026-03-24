/**
 * Identity Profile 生成器
 * 从扫描结果中聚合用户画像
 */
export interface TechStack {
    languages: string[];
    frameworks: string[];
    infra: string[];
    tools: string[];
}
export interface CodeStyle {
    indent: string | null;
    quotes: string | null;
    semicolons: boolean | null;
    trailingComma: string | null;
}
export interface TeamInfo {
    org: string | null;
    platform: string | null;
    communication: string[];
}
export interface CurrentProject {
    name: string | null;
    description: string | null;
    path: string | null;
}
export interface IdentityProfile {
    name: string | null;
    role: string | null;
    email: string | null;
    techStack: TechStack;
    codeStyle: CodeStyle;
    team: TeamInfo;
    currentProject: CurrentProject;
    blockCount: number;
    sources: string[];
}
/**
 * 从扫描的 blocks 中聚合用户画像
 */
export declare function generateProfile(blocks: Array<{
    content: string;
    annotation: string;
    metadata?: Record<string, unknown>;
}>): IdentityProfile;
/**
 * 格式化用户画像为可读文本
 */
export declare function formatProfile(profile: IdentityProfile): string;
declare const _default: {
    generateProfile: typeof generateProfile;
    formatProfile: typeof formatProfile;
};
export default _default;
//# sourceMappingURL=profile.d.ts.map