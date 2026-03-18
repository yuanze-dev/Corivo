/**
 * CLI 命令 - save
 *
 * 保存信息到 Corivo
 */
interface SaveOptions {
    content?: string;
    annotation?: string;
    source?: string;
}
export declare function saveCommand(options: SaveOptions): Promise<void>;
export declare function readPassword(prompt: string): Promise<string>;
export {};
//# sourceMappingURL=save.d.ts.map