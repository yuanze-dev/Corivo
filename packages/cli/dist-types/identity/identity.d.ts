/**
 * 用户身份管理
 *
 * 管理用户的跨设备、跨平台身份
 *
 * 核心设计：
 * - 对用户完全透明，无感知自动识别
 * - 支持多平台（Claude Code, Cursor, Codex, 飞书, Slack 等）
 * - 支持历史指纹（token 变化后仍能识别）
 * - 支持多设备关联
 */
import type { Fingerprint } from './fingerprint.js';
/**
 * 平台类型（可扩展）
 */
export type SupportedPlatform = 'claude_code' | 'cursor' | 'codex' | 'opencode' | 'windsurf' | 'feishu' | 'slack' | 'wechat' | 'dingtalk' | 'notion' | 'github' | 'device' | 'email' | 'custom';
/**
 * 单个平台的所有指纹（支持历史记录）
 */
export interface PlatformFingerprint {
    /** 当前主指纹 */
    current: string;
    /** 历史指纹（token 变化后旧指纹移入这里） */
    historical: string[];
    /** 首次添加时间 */
    added_at: string;
    /** 最后更新时间 */
    updated_at: string;
    /** 置信度 */
    confidence: 'high' | 'medium' | 'low';
}
/**
 * 设备信息
 */
export interface DeviceInfo {
    id: string;
    name: string;
    platform: string;
    arch: string;
    first_seen: string;
    last_seen: string;
}
/**
 * 身份配置
 */
export interface IdentityConfig {
    /** 虚拟身份 ID（UUID，不暴露真实身份） */
    identity_id: string;
    /** 创建时间 */
    created_at: string;
    /** 最后更新时间 */
    updated_at: string;
    /** 显示名称（可选，仅供用户自己看） */
    display_name?: string;
    /** 所有平台指纹 */
    fingerprints: Record<string, PlatformFingerprint>;
    /** 设备列表 */
    devices: Record<string, DeviceInfo>;
}
/**
 * 匹配结果
 */
export interface MatchResult {
    /** 是否匹配 */
    matched: boolean;
    /** 置信度 (0-1) */
    confidence: number;
    /** 匹配的平台 */
    matched_platforms: string[];
    /** 是否通过历史指纹匹配 */
    matched_via_historical: boolean;
}
/**
 * 身份管理器
 */
export declare class IdentityManager {
    private configPath;
    private config;
    constructor(configDir?: string);
    private getDefaultConfigDir;
    /**
     * 加载身份配置
     */
    load(): Promise<IdentityConfig | null>;
    /**
     * 保存身份配置
     */
    private save;
    /**
     * 用指定 ID 创建身份（用于加入已有 identity）
     */
    createWithId(identityId: string, fingerprints: Fingerprint[], displayName?: string): Promise<IdentityConfig>;
    /**
     * 创建新身份
     */
    create(fingerprints: Fingerprint[], displayName?: string): Promise<IdentityConfig>;
    /**
     * 添加或更新平台指纹（支持历史记录）
     *
     * 如果指纹值变化，旧值自动移入 historical
     */
    syncFingerprint(fingerprint: Fingerprint): Promise<boolean>;
    /**
     * 批量同步指纹
     */
    syncFingerprints(fingerprints: Fingerprint[]): Promise<boolean>;
    /**
     * 注册或更新设备
     */
    registerDevice(): Promise<string>;
    /**
     * 获取当前设备 ID
     */
    private getCurrentDeviceId;
    /**
     * 获取设备名称
     */
    private getDeviceName;
    /**
     * 生成身份 ID
     */
    private generateIdentityId;
    /**
     * 获取当前身份
     */
    getIdentity(): Promise<IdentityConfig | null>;
    /**
     * 获取身份 ID
     */
    getIdentityId(): Promise<string | null>;
    /**
     * 匹配身份（支持历史指纹）
     */
    matchIdentity(fingerprints: Fingerprint[]): MatchResult;
}
/**
 * 初始化或加载身份（对用户完全无感知）
 *
 * 自动：
 * 1. 收集所有可用平台指纹
 * 2. 尝试匹配现有身份
 * 3. 匹配成功则同步新指纹
 * 4. 匹配失败则创建新身份
 * 5. 自动注册当前设备
 */
export declare function initializeIdentity(configDir?: string): Promise<{
    identity: IdentityConfig;
    isNew: boolean;
    fingerprints: Fingerprint[];
}>;
/**
 * 获取身份 ID（快捷方法）
 */
export declare function getIdentityId(configDir?: string): Promise<string | null>;
/**
 * 用指定 identity_id 初始化本地身份（用于加入已有 identity 的新设备）
 */
export declare function initializeIdentityWithId(identityId: string, configDir?: string): Promise<IdentityConfig>;
//# sourceMappingURL=identity.d.ts.map