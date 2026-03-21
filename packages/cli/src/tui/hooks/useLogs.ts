import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 100;

export function useLogs(configDir: string): { lines: string[]; error: string | null } {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const posRef = useRef(0);

  useEffect(() => {
    const logPath = path.join(configDir, 'daemon.log');
    let watcher: fs.FSWatcher | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const readNew = async () => {
      try {
        const stat = await fsPromises.stat(logPath);
        const size = stat.size;
        if (size === 0) return;

        if (posRef.current === 0) {
          // First read: start from max 8KB from end
          posRef.current = Math.max(0, size - 8192);
        }

        if (posRef.current >= size) return;

        const handle = await fsPromises.open(logPath, 'r');
        const buf = Buffer.alloc(size - posRef.current);
        await handle.read(buf, 0, buf.length, posRef.current);
        await handle.close();

        posRef.current = size;
        const newLines = buf.toString('utf-8').split('\n').filter(l => l.trim());
        setLines(prev => [...prev, ...newLines].slice(-MAX_LINES));
        setError(null);
      } catch {
        setError(`Log file not found: ${logPath}`);
      }
    };

    readNew();

    try {
      watcher = fs.watch(logPath, () => { readNew(); });
    } catch {
      // file doesn't exist yet — fall back to polling
      pollInterval = setInterval(readNew, 2000);
    }

    return () => {
      watcher?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [configDir]);

  return { lines, error };
}
