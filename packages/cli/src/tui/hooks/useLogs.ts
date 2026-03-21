import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 100;

// 每条日志行带稳定 ID，避免 key 不稳定导致 React 重建节点
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
  // 全局递增 ID，保证每条日志行的 key 唯一且稳定
  const idCounterRef = useRef(0);
  // fs.watch debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return; // 非 logs tab 时不启动文件监听

    const logPath = path.join(configDir, 'daemon.log');
    let watcher: fs.FSWatcher | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const readNew = async () => {
      try {
        const stat = await fsPromises.stat(logPath);
        const size = stat.size;
        if (size === 0) return;

        if (posRef.current === 0) {
          // 首次读取：从末尾 8KB 开始，避免读取全部历史
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

        // 给每条新行分配稳定 ID
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
      // 100ms 去抖：合并 daemon 快速连续写入触发的多次 watch 事件
      debounceRef.current = setTimeout(() => readNew(), 100);
    };

    try {
      watcher = fs.watch(logPath, debouncedRead);
    } catch {
      // 文件不存在时退回轮询
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
