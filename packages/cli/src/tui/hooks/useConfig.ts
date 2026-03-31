import { useState, useEffect, useCallback, useRef } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CorivoConfig, CorivoFeatures, CorivoSettings } from '../../config.js';

export interface UseConfigResult {
  config: CorivoConfig | null;
  loading: boolean;
  toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
  updateSetting: (key: keyof CorivoSettings, value: number) => Promise<void>;
  savedFlash: boolean;
}

export function useConfig(configDir: string): UseConfigResult {
  const [config, setConfig] = useState<CorivoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);
  const configPath = path.join(configDir, 'config.json');
  // Save flashTimer ref and clean it when the component is uninstalled to avoid memory leaks
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Clean flash timer when component is uninstalled
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const toggleFeature = useCallback(async (key: keyof CorivoFeatures) => {
    if (!config) return;
    // opt-out model: missing key = true → first toggle becomes false
    const current = config.features?.[key] !== false;
    const updated: CorivoConfig = {
      ...config,
      features: { ...config.features, [key]: !current },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    // Clean up the last untriggered timer to avoid flash disappearing early when toggle is repeated.
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);

  const updateSetting = useCallback(async (key: keyof CorivoSettings, value: number) => {
    if (!config) return;
    const updated: CorivoConfig = {
      ...config,
      settings: { ...config.settings, [key]: value },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);

  return { config, loading, toggleFeature, updateSetting, savedFlash };
}
