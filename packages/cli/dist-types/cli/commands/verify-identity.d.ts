/**
 * CLI 命令 - verify-identity
 *
 * 跨设备身份验证（指纹 + 密码联合验证）
 */
interface VerifyIdentityOptions {
    password?: string;
    verbose?: boolean;
}
export declare function verifyIdentityCommand(options?: VerifyIdentityOptions): Promise<void>;
export {};
//# sourceMappingURL=verify-identity.d.ts.map