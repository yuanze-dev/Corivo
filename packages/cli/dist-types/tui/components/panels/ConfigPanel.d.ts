import React from 'react';
import type { UseConfigResult } from '../../hooks/useConfig.js';
import type { CorivoFeatures } from '../../../config.js';
export interface FeatureItem {
    key: keyof CorivoFeatures;
    label: string;
    group: string;
}
export declare const FEATURE_ITEMS: FeatureItem[];
export declare function formatSeconds(s: number): string;
export declare function nextSyncPreset(current: number): number;
export declare function prevSyncPreset(current: number): number;
export declare const CONFIG_ITEM_COUNT: number;
export declare const SYNC_INTERVAL_INDEX: number;
interface ConfigPanelProps {
    configState: UseConfigResult;
    focusIndex: number;
    panelHeight: number;
}
export declare const ConfigPanel: React.NamedExoticComponent<ConfigPanelProps>;
export {};
//# sourceMappingURL=ConfigPanel.d.ts.map