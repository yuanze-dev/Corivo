/**
 * CLI 命令 - query
 *
 * 查询 Corivo 中的信息
 */
interface QueryOptions {
    limit?: string;
    verbose?: boolean;
    pattern?: boolean;
    noPassword?: boolean;
}
export declare function queryCommand(query: string, options: QueryOptions): Promise<void>;
export {};
//# sourceMappingURL=query.d.ts.map