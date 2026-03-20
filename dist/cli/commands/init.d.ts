/**
 * CLI 命令 - init
 *
 * 初始化 Corivo，基于平台指纹创建身份
 *
 * v0.10+ 更新：
 * - 基于平台指纹的用户身份识别（无需密码）
 * - 跨设备身份关联
 * - 数据库密钥明文存储（依赖文件系统权限）
 * - init 后自动启动心跳守护进程
 */
/**
 * 初始化命令
 */
export declare function initCommand(): Promise<void>;
//# sourceMappingURL=init.d.ts.map