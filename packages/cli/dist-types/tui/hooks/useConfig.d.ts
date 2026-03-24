import type { CorivoConfig, CorivoFeatures, CorivoSettings } from '../../config.js';
export interface UseConfigResult {
    config: CorivoConfig | null;
    loading: boolean;
    toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
    updateSetting: (key: keyof CorivoSettings, value: number) => Promise<void>;
    savedFlash: boolean;
}
export declare function useConfig(configDir: string): UseConfigResult;
//# sourceMappingURL=useConfig.d.ts.map