export interface DaemonStatus {
    running: boolean;
    pid: number | null;
    uptime: number | null;
    cycleCount: number | null;
    lastCheckAge: number | null;
    logPath: string;
    errPath: string;
}
export declare function useDaemon(configDir: string): DaemonStatus;
//# sourceMappingURL=useDaemon.d.ts.map