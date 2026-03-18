/**
 * 密钥管理（静态工具类）
 *
 * 提供密钥派生、加解密、恢复密钥等功能
 */
/**
 * 密钥管理静态类
 */
export declare class KeyManager {
    /**
     * 从密码派生主密钥（PBKDF2）
     *
     * @param password - 用户密码
     * @param salt - 盐值
     * @returns 派生的主密钥
     */
    static deriveMasterKey(password: string, salt: Buffer): Buffer;
    /**
     * 生成随机盐值
     *
     * @returns 16 字节随机盐值
     */
    static generateSalt(): Buffer;
    /**
     * 生成随机数据库密钥
     *
     * @returns 32 字节随机密钥
     */
    static generateDatabaseKey(): Buffer;
    /**
     * 加密数据库密钥
     *
     * 使用 AES-256-GCM 加密
     *
     * @param dbKey - 数据库密钥
     * @param masterKey - 主密钥
     * @returns Base64 编码的密文（IV + AuthTag + 密文）
     */
    static encryptDatabaseKey(dbKey: Buffer, masterKey: Buffer): string;
    /**
     * 解密数据库密钥
     *
     * @param encrypted - Base64 编码的密文
     * @param masterKey - 主密钥
     * @returns 解密后的数据库密钥
     */
    static decryptDatabaseKey(encrypted: string, masterKey: Buffer): Buffer;
    /**
     * 生成恢复密钥（16 词 BIP39 风格）
     *
     * @param masterKey - 主密钥
     * @returns 16 个空格分隔的单词
     */
    static generateRecoveryKey(masterKey: Buffer): string;
    /**
     * 从恢复密钥派生主密钥
     *
     * @param recoveryKey - 16 个空格分隔的单词
     * @returns 派生的主密钥
     */
    static deriveFromRecoveryKey(recoveryKey: string): Buffer;
    /**
     * 验证密码强度
     *
     * @param password - 待验证的密码
     * @returns 是否足够强
     */
    static validatePasswordStrength(password: string): boolean;
    /**
     * 生成加密盐值提示
     *
     * @returns 用于显示的盐值提示
     */
    static getSaltHint(): string;
}
//# sourceMappingURL=keys.d.ts.map