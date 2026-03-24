/**
 * CLI 命令 - unlock
 *
 * 解锁并查看数据库内容
 */
interface UnlockOptions {
    raw?: boolean;
    limit?: number;
}
export declare function unlockCommand(options?: UnlockOptions): Promise<void>;
export {};
//# sourceMappingURL=unlock.d.ts.map