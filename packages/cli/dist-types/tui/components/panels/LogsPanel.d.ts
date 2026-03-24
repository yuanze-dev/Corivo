import React from 'react';
import type { LogLine } from '../../hooks/useLogs.js';
interface LogsPanelProps {
    lines: LogLine[];
    error: string | null;
    scrollOffset: number;
    panelHeight: number;
}
export declare const LogsPanel: React.NamedExoticComponent<LogsPanelProps>;
export {};
//# sourceMappingURL=LogsPanel.d.ts.map