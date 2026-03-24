/**
 * CLI 命令 - setup-password
 *
 * 设置主密码，用于数据库加密和跨设备身份验证
 */
interface SetupPasswordOptions {
    force?: boolean;
}
export declare function setupPasswordCommand(options?: SetupPasswordOptions): Promise<void>;
export {};
//# sourceMappingURL=setup-password.d.ts.map