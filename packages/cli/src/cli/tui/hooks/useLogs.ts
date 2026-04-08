import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 100;

// Each log line has a stable ID to avoid key instability causing React to rebuild the node.
export interface LogLine {
  id: number;
  text: string;
}

export function useLogs(
  configDir: string,
  enabled: boolean,
): { lines: LogLine[]; error: string | null } {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const posRef = useRef(0);
  // Increment the ID globally to ensure that the key of each log line is unique and stable
  const idCounterRef = useRef(0);
  // fs.watch debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return; // Do not start file monitoring when not in logs tab

    const logPath = path.join(configDir, 'daemon.log');
    let watcher: fs.FSWatcher | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const readNew = async () => {
      try {
        const stat = await fsPromises.stat(logPath);
        const size = stat.size;
        if (size === 0) return;

        if (posRef.current === 0) {
          // First read: start from the last 8KB to avoid reading the entire history
          posRef.current = Math.max(0, size - 8192);
        }

        if (posRef.current >= size) return;

        const handle = await fsPromises.open(logPath, 'r');
        const buf = Buffer.alloc(size - posRef.current);
        await handle.read(buf, 0, buf.length, posRef.current);
        await handle.close();

        posRef.current = size;
        const newLines = buf.toString('utf-8').split('\n').filter(l => l.trim());
        if (newLines.length === 0) return;

        // Assign a stable ID to each new row
        const tagged: LogLine[] = newLines.map(text => ({
          id: idCounterRef.current++,
          text,
        }));
        setLines(prev => [...prev, ...tagged].slice(-MAX_LINES));
        setError(null);
      } catch {
        setError(`Log file not found: ${logPath}`);
      }
    };

    readNew();

    const debouncedRead = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // 100ms debounce: merge multiple watch events triggered by daemon's rapid continuous writes
      debounceRef.current = setTimeout(() => readNew(), 100);
    };

    try {
      watcher = fs.watch(logPath, debouncedRead);
    } catch {
      // Return to polling when file does not exist
      pollInterval = setInterval(readNew, 2000);
    }

    return () => {
      watcher?.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [configDir, enabled]);

  return { lines, error };
}
