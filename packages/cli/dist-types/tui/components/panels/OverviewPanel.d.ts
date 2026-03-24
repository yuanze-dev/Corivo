import React from 'react';
import type { DbStats } from '../../hooks/useDatabase.js';
interface OverviewPanelProps {
    stats: DbStats | null;
    loading: boolean;
    scrollOffset: number;
    panelHeight: number;
}
export declare const OverviewPanel: React.NamedExoticComponent<OverviewPanelProps>;
export {};
//# sourceMappingURL=OverviewPanel.d.ts.map