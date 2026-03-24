export interface LogLine {
    id: number;
    text: string;
}
export declare function useLogs(configDir: string, enabled: boolean): {
    lines: LogLine[];
    error: string | null;
};
//# sourceMappingURL=useLogs.d.ts.map