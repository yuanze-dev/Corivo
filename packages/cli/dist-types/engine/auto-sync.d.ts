/**
 * 自动同步引擎
 *
 * 在心跳守护进程中后台自动执行 push/pull，无需用户手动触发。
 * 前提：用户已通过 `corivo sync --register` 完成注册。
 */
import type { CorivoDatabase } from '../storage/database.js';
export declare class AutoSync {
    private db;
    private token;
    private tokenObtainedAt;
    constructor(db: CorivoDatabase);
    /**
     * 执行一次同步（push + pull）
     * @returns 同步结果计数，若未配置或出错则返回 null
     */
    run(): Promise<{
        pushed: number;
        pulled: number;
    } | null>;
    private ensureToken;
    private isTokenValid;
}
//# sourceMappingURL=auto-sync.d.ts.map