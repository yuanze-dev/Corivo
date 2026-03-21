import { useState, useEffect, useCallback } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CorivoConfig, CorivoFeatures } from '../../config.js';

export interface UseConfigResult {
  config: CorivoConfig | null;
  loading: boolean;
  toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
  savedFlash: boolean;
}

export function useConfig(configDir: string): UseConfigResult {
  const [config, setConfig] = useState<CorivoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);
  const configPath = path.join(configDir, 'config.json');

  const load = useCallback(async () => {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      setConfig(JSON.parse(raw));
    } catch {
      // file missing or invalid
    } finally {
      setLoading(false);
    }
  }, [configPath]);

  useEffect(() => { load(); }, [load]);

  const toggleFeature = useCallback(async (key: keyof CorivoFeatures) => {
    if (!config) return;
    // opt-out model: missing key = true → first toggle makes it false
    const current = config.features?.[key] !== false;
    const updated: CorivoConfig = {
      ...config,
      features: { ...config.features, [key]: !current },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);

  return { config, loading, toggleFeature, savedFlash };
}
