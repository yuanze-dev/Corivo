/**
 * CLI 命令 - save
 *
 * 保存信息到 Corivo
 */
interface SaveOptions {
    content?: string;
    annotation?: string;
    source?: string;
    pending?: boolean;
}
export declare function saveCommand(options: SaveOptions): Promise<void>;
export {};
//# sourceMappingURL=save.d.ts.map