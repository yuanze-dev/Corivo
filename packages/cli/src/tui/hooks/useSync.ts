import { useState, useEffect } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SolverConfig } from '../../config.js';

export function useSync(configDir: string): { solver: SolverConfig | null } {
  const [solver, setSolver] = useState<SolverConfig | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await fs.readFile(path.join(configDir, 'solver.json'), 'utf-8');
        setSolver(JSON.parse(raw));
      } catch {
        setSolver(null);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [configDir]);

  return { solver };
}
