import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  uptime: number | null;  // seconds
  cycleCount: number | null;
  lastCheckAge: number | null;  // ms since last health write
  logPath: string;
  errPath: string;
}

export function useDaemon(configDir: string): DaemonStatus {
  const [status, setStatus] = useState<DaemonStatus>({
    running: false, pid: null, uptime: null, cycleCount: null,
    lastCheckAge: null, logPath: '', errPath: '',
  });
  // Last data fingerprint, skip no change update (lastCheckAge accuracy is reduced to seconds to avoid refreshing every second)
  const lastFingerprintRef = useRef('');

  useEffect(() => {
    const pidPath = path.join(configDir, 'heartbeat.pid');
    const healthPath = path.join(configDir, '.heartbeat-health');
    const logPath = path.join(configDir, 'daemon.log');
    const errPath = path.join(configDir, 'daemon.err');

    const check = async () => {
      let running = false;
      let pid: number | null = null;
      let uptime: number | null = null;
      let cycleCount: number | null = null;
      let lastCheckAge: number | null = null;

      try {
        const pidStr = await fs.readFile(pidPath, 'utf-8');
        pid = parseInt(pidStr.trim(), 10);
        process.kill(pid, 0);  // throws if not running
        running = true;
      } catch { pid = null; }

      if (running) {
        try {
          const healthRaw = await fs.readFile(healthPath, 'utf-8');
          const health = JSON.parse(healthRaw);
          uptime = health.uptime ?? null;
          cycleCount = health.cycleCount ?? null;
          lastCheckAge = Date.now() - (health.timestamp ?? 0);
        } catch {}
      }

      // The accuracy of lastCheckAge is reduced to 5 seconds to avoid triggering rendering for each check.
      const ageBucket = lastCheckAge !== null ? Math.floor(lastCheckAge / 5000) : null;
      const fingerprint = `${running}:${pid}:${uptime}:${cycleCount}:${ageBucket}`;
      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;

      setStatus({ running, pid, uptime, cycleCount, lastCheckAge, logPath, errPath });
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [configDir]);

  return status;
}
