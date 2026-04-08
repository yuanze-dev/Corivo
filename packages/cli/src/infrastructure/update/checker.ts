/**
 * version checker
 * Check and install new versions via npm registry
 */

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compareSemVer } from './semver.js';
import type { VersionInfo, UpdateStatus, UpdateConfig, Platform } from './types.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/corivo';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 5000;

interface NpmRegistryMetadata {
  'dist-tags'?: {
    latest?: string;
  };
  time?: Record<string, string>;
}

/**
 * Get current version
 */
export function getCurrentVersion(): string {
  if (process.env.CORIVO_CURRENT_VERSION) {
    return process.env.CORIVO_CURRENT_VERSION;
  }

  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = path.join(currentDir, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: string };
    return packageJson.version || '0.11.0';
  } catch {
    return process.env.npm_package_version || '0.11.0';
  }
}

/**
 * Get version information (from npm registry)
 */
export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  const metadata = await fetchRegistryMetadata();
  const latestVersion = metadata?.['dist-tags']?.latest;

  if (!latestVersion) {
    return null;
  }

  return {
    version: latestVersion,
    released_at: metadata?.time?.[latestVersion] || new Date().toISOString(),
    breaking: false,
    changelog: '',
  };
}

/**
 * Check for updates
 */
export async function checkForUpdate(config: UpdateConfig = {}): Promise<UpdateStatus> {
  const currentVersion = getCurrentVersion();
  const lastCheck = await getLastCheckTime();
  const now = Date.now();

  if (config.pin && isVersionInRange(currentVersion, config.pin)) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      isBreaking: false,
      lastCheck,
      nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
    };
  }

  const latestInfo = await fetchVersionInfo();

  if (!latestInfo) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      isBreaking: false,
      lastCheck: now,
      nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
    };
  }

  const hasUpdate = compareSemVer(latestInfo.version, currentVersion) > 0;

  await saveLastCheckTime(now);

  return {
    currentVersion,
    latestVersion: latestInfo.version,
    hasUpdate,
    isBreaking: false,
    lastCheck: now,
    nextCheck: now + (config.checkInterval || CHECK_INTERVAL),
  };
}

/**
 * perform update
 */
export async function performUpdate(
  versionInfo: VersionInfo,
  _platform: Platform
): Promise<{ success: boolean; error?: string }> {
  try {
    execFileSync(
      'npm',
      ['install', '-g', `corivo@${versionInfo.version}`],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    await saveUpdateRecord({
      from: getCurrentVersion(),
      to: versionInfo.version,
      at: new Date().toISOString(),
      changelog: versionInfo.changelog,
    });

    return { success: true };
  } catch (error) {
    const message = extractCommandError(error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'Darwin-arm64' : 'Darwin-x64';
  }

  if (platform === 'linux') {
    return 'Linux-x64';
  }

  return 'Darwin-arm64';
}

async function fetchRegistryMetadata(): Promise<NpmRegistryMetadata | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, REQUEST_TIMEOUT);

    const request = https.get(NPM_REGISTRY_URL, (res) => {
      clearTimeout(timeout);

      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as NpmRegistryMetadata);
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function extractCommandError(error: unknown): string {
  if (error instanceof Error) {
    const withOutput = error as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    if (withOutput.stderr) {
      return String(withOutput.stderr).trim();
    }
    if (withOutput.stdout) {
      return String(withOutput.stdout).trim();
    }
    return error.message;
  }

  return String(error);
}

function isVersionInRange(version: string, range: string): boolean {
  const parts = version.split('.');
  const rangeParts = range.split('.');

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const rangeMajor = parseInt(rangeParts[0], 10);
  const rangeMinor = rangeParts[1];

  if (!isNaN(rangeMajor) && major !== rangeMajor) {
    return false;
  }

  if (rangeMinor !== 'x' && !isNaN(minor) && !isNaN(parseInt(rangeMinor, 10))) {
    if (minor !== parseInt(rangeMinor, 10)) {
      return false;
    }
  }

  return true;
}

async function getLastCheckTime(): Promise<number | null> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    const lastUpdatePath = path.join(updateDir, 'last-update.json');

    const content = await fs.readFile(lastUpdatePath, 'utf-8');
    const record = JSON.parse(content) as { checked_at?: number };
    return record.checked_at || null;
  } catch {
    return null;
  }
}

async function saveLastCheckTime(time: number): Promise<void> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    await fs.mkdir(updateDir, { recursive: true });

    const lastUpdatePath = path.join(updateDir, 'last-update.json');
    const record = await fs.readFile(lastUpdatePath, 'utf-8').then(JSON.parse).catch(() => ({}));

    record.checked_at = time;
    await fs.writeFile(lastUpdatePath, JSON.stringify(record, null, 2));
  } catch {
    // ignore errors
  }
}

async function saveUpdateRecord(record: {
  from: string;
  to: string;
  at: string;
  changelog: string;
}): Promise<void> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    await fs.mkdir(updateDir, { recursive: true });

    const lastUpdatePath = path.join(updateDir, 'last-update.json');
    await fs.writeFile(lastUpdatePath, JSON.stringify(record, null, 2));
  } catch {
    // ignore errors
  }
}

export async function getUpdateRecord(): Promise<{
  from?: string;
  to?: string;
  at?: string;
  changelog?: string;
} | null> {
  try {
    const updateDir = path.join(os.homedir(), '.corivo');
    const lastUpdatePath = path.join(updateDir, 'last-update.json');

    const content = await fs.readFile(lastUpdatePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export default {
  getCurrentVersion,
  fetchVersionInfo,
  checkForUpdate,
  performUpdate,
  getPlatform,
  getUpdateRecord,
};
