/**
 * 身份验证模块
 *
 * 提供可选的找回密码/身份验证功能
 *
 * 设计理念：
 * - 可选功能，用户主动选择是否设置
 * - 验证优先级高于所有指纹采集
 * - 用于跨设备身份恢复或手动身份确认
 *
 * 使用场景：
 * 1. 换新设备后，指纹无法自动匹配时
 * 2. 多人共用设备时，手动确认身份
 * 3. 身份被盗时，通过验证码夺回控制权
 */
import type { IdentityConfig } from './identity.js';
/**
 * 身份验证配置
 */
export interface IdentityAuthConfig {
    /** 是否启用身份验证 */
    enabled: boolean;
    /** 验证码哈希（经过 PBKDF2 处理） */
    verifier: string;
    /** 盐值 */
    salt: string;
    /** 提示问题（可选） */
    hint?: string;
    /** 设置时间 */
    created_at: string;
    /** 最后使用时间 */
    last_used_at?: string;
}
/**
 * 验证结果
 */
export interface VerifyResult {
    /** 是否验证成功 */
    success: boolean;
    /** 剩余尝试次数（失败时） */
    remaining_attempts?: number;
}
/**
 * 身份验证器
 */
export declare class IdentityAuth {
    private authConfigPath;
    constructor(configDir?: string);
    /**
     * 检查是否已设置身份验证
     */
    isEnabled(): Promise<boolean>;
    /**
     * 设置身份验证码
     *
     * @param code - 验证码（用户提供的密码/短语）
     * @param hint - 提示问题（可选）
     */
    setup(code: string, hint?: string): Promise<void>;
    /**
     * 验证身份验证码
     *
     * @param code - 用户输入的验证码
     * @returns 验证结果
     */
    verify(code: string): Promise<VerifyResult>;
    /**
     * 更新验证码
     *
     * @param oldCode - 旧验证码（用于验证）
     * @param newCode - 新验证码
     */
    update(oldCode: string, newCode: string): Promise<boolean>;
    /**
     * 禁用身份验证
     *
     * @param code - 当前验证码（需要验证）
     */
    disable(code: string): Promise<boolean>;
    /**
     * 获取提示问题
     */
    getHint(): Promise<string | null>;
    /**
     * 获取验证配置（不包含敏感信息）
     */
    getPublicInfo(): Promise<{
        enabled: boolean;
        has_hint: boolean;
        created_at?: string;
        last_used_at?: string;
    } | null>;
}
/**
 * 身份合并器
 *
 * 使用验证码合并身份
 */
export declare class IdentityMerger {
    /**
     * 通过验证码证明身份并合并
     *
     * @param targetIdentity - 目标身份配置
     * @param code - 验证码
     * @param auth - 身份验证器
     * @returns 是否合并成功
     */
    static mergeWithAuth(targetIdentity: IdentityConfig, code: string, auth: IdentityAuth): Promise<boolean>;
    /**
     * 通过验证码恢复身份
     *
     * @param code - 验证码
     * @param auth - 身份验证器
     * @returns 身份配置（如果验证成功）
     */
    static recoverWithAuth(code: string, auth: IdentityAuth): Promise<IdentityConfig | null>;
}
/**
 * CLI 辅助函数
 */
/**
 * 设置身份验证码（交互式）
 */
export declare function setupAuthPrompt(): Promise<void>;
/**
 * 联合验证结果
 */
export interface JointVerificationResult {
    /** 是否验证成功 */
    success: boolean;
    /** 指纹匹配分数 (0-100) */
    fingerprintScore?: number;
    /** 密码是否正确 */
    passwordValid?: boolean;
    /** 综合置信度 */
    confidence: 'low' | 'medium' | 'high' | 'very_high';
    /** 验证方法 */
    method: 'fingerprint_only' | 'password_only' | 'joint';
}
/**
 * 联合验证器
 *
 * 结合指纹和密码进行身份验证，提供更强的安全保障
 */
export declare class JointVerifier {
    private auth;
    constructor(auth?: IdentityAuth);
    /**
     * 联合验证：指纹 + 密码
     *
     * @param fingerprints - 当前设备的指纹列表
     * @param targetIdentity - 目标身份配置
     * @param password - 用户输入的密码（可选）
     * @returns 验证结果
     */
    verify(fingerprints: string[], targetIdentity: IdentityConfig, password?: string): Promise<JointVerificationResult>;
    /**
     * 匹配指纹
     *
     * @param currentFingerprints - 当前设备指纹
     * @param targetIdentity - 目标身份
     * @returns 匹配分数 (0-100)
     */
    private matchFingerprints;
    /**
     * 获取置信度分数
     */
    private getConfidenceScore;
    /**
     * 计算综合置信度
     */
    private calculateConfidence;
    /**
     * 跨设备身份恢复
     *
     * 当指纹完全不匹配时，通过密码证明身份
     *
     * @param password - 用户密码
     * @param deviceId - 新设备 ID
     * @returns 是否恢复成功
     */
    recoverAcrossDevice(password: string, deviceId: string): Promise<boolean>;
}
/**
 * 验证身份码（交互式）
 */
export declare function verifyAuthPrompt(hint?: string): Promise<boolean>;
//# sourceMappingURL=auth.d.ts.map