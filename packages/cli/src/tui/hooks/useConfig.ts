import { useState, useEffect, useCallback, useRef } from 'react';
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
  // 保存 flashTimer ref，组件卸载时清理，避免内存泄漏
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

  // 组件卸载时清理 flash timer
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const toggleFeature = useCallback(async (key: keyof CorivoFeatures) => {
    if (!config) return;
    // opt-out 模型：missing key = true → 第一次 toggle 变为 false
    const current = config.features?.[key] !== false;
    const updated: CorivoConfig = {
      ...config,
      features: { ...config.features, [key]: !current },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    // 清理上一个未触发的 timer，避免重复 toggle 时 flash 提前消失
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);

  return { config, loading, toggleFeature, savedFlash };
}
