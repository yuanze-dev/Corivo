/**
 * 密钥管理（静态工具类）
 *
 * 提供密钥派生、加解密、恢复密钥等功能
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
     * 生成恢复密钥（24 词 BIP39 风格）
     *
     * 使用标准 BIP39 方法：每个词代表 11 位，24 词 = 264 位
     * 其中 256 位是密钥，8 位是校验和
     *
     * @param masterKey - 主密钥（32 字节）
     * @returns 24 个空格分隔的单词
     */
    static generateRecoveryKey(masterKey: Buffer): string;
    /**
     * 从恢复密钥派生主密钥
     *
     * 从 24 个单词解码还原主密钥
     *
     * @param recoveryKey - 24 个空格分隔的单词
     * @returns 派生的主密钥（32 字节）
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
    /**
     * 加密内容（用于数据库存储）
     *
     * 使用 AES-256-GCM 加密，返回 Base64 编码的密文
     *
     * @param content - 明文内容
     * @param dbKey - 数据库密钥
     * @returns Base64 编码的密文（IV + AuthTag + 密文）
     */
    static encryptContent(content: string, dbKey: Buffer): string;
    /**
     * 解密内容（从数据库读取）
     *
     * @param encrypted - Base64 编码的密文
     * @param dbKey - 数据库密钥
     * @returns 解密后的明文
     */
    static decryptContent(encrypted: string, dbKey: Buffer): string;
    /**
     * 检测内容是否为加密格式
     *
     * 加密的内容是有效的 Base64，且解密后长度合理
     *
     * @param content - 待检测内容
     * @returns 是否为加密格式
     */
    static isEncryptedContent(content: string): boolean;
}
//# sourceMappingURL=keys.d.ts.map