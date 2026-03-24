/**
 * CLI 命令 - sync
 *
 * 与 Corivo solver 服务器同步记忆数据
 */
import { Command } from 'commander';
export declare function post(url: string, body: unknown, token?: string): Promise<unknown>;
export declare function get(url: string, token: string): Promise<unknown>;
export declare function authenticate(serverUrl: string, identityId: string, sharedSecret: string): Promise<string>;
/**
 * 向 solver 服务器注册，返回 SolverConfig；失败返回 null
 */
export declare function registerWithSolver(serverUrl: string, identityId: string): Promise<import('../../config.js').SolverConfig | null>;
export declare function createSyncCommand(): Command;
//# sourceMappingURL=sync.d.ts.map