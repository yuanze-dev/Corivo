import React from 'react';
interface StatusBarProps {
    daemonRunning: boolean;
    syncConfigured: boolean;
    dbHealthy: boolean;
    pid?: number | null;
    savedFlash?: boolean;
}
export declare const StatusBar: React.NamedExoticComponent<StatusBarProps>;
export {};
//# sourceMappingURL=StatusBar.d.ts.map