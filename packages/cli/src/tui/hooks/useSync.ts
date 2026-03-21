import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SolverConfig } from '../../config.js';

export function useSync(configDir: string): { solver: SolverConfig | null } {
  const [solver, setSolver] = useState<SolverConfig | null>(null);
  // 上次数据指纹，undefined 表示从未加载过
  const lastFingerprintRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await fs.readFile(path.join(configDir, 'solver.json'), 'utf-8');
        // 数据未变化则跳过 setState
        if (raw === lastFingerprintRef.current) return;
        lastFingerprintRef.current = raw;
        setSolver(JSON.parse(raw));
      } catch {
        if (lastFingerprintRef.current !== null) {
          lastFingerprintRef.current = null;
          setSolver(null);
        }
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [configDir]);

  return { solver };
}
