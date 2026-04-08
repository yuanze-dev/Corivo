import { useState, useEffect } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IdentityConfig } from '@/infrastructure/identity/identity.js';

export interface DeviceInfo {
  identity: IdentityConfig | null;
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  dbPath: string;
  configPath: string;
  identityPath: string;
  logPath: string;
}

export function useDevice(configDir: string, dbPath: string): DeviceInfo {
  const [identity, setIdentity] = useState<IdentityConfig | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await fs.readFile(path.join(configDir, 'identity.json'), 'utf-8');
        setIdentity(JSON.parse(raw));
      } catch {}
    };
    load();
  }, [configDir]);

  return {
    identity,
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    dbPath,
    configPath: path.join(configDir, 'config.json'),
    identityPath: path.join(configDir, 'identity.json'),
    logPath: path.join(configDir, 'daemon.log'),
  };
}
