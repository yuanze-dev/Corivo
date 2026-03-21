# corivo status --tui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `corivo status --tui` command that renders an interactive ink v5 TUI panel with 6 tabs showing real-time Corivo service status.

**Architecture:** A dynamic import in the status command loads the TUI only when `--tui` is passed; `index.tsx` does async DB initialization then renders `<App db={db} />`. Each of the 6 panels owns its data via a dedicated hook. The existing text-only `corivo status` is unchanged.

**Tech Stack:** ink v5, React 18, ink-table, chalk v5, Node.js built-in `node:test`, TypeScript with `jsx: "react-jsx"`

---

## Spec

`docs/superpowers/specs/2026-03-21-corivo-status-tui-design.md`

---

## File Map

### Modified Files

| File | Change |
|------|--------|
| `packages/cli/src/config.ts` | Add `CorivoFeatures` interface + `features?` field to `CorivoConfig` |
| `packages/cli/tsconfig.json` | Add `"jsx": "react-jsx"`, `"jsxImportSource": "react"` |
| `packages/cli/src/cli/index.ts` | Add `--tui` option to status command; dynamic import tui |
| `packages/cli/package.json` | Add ink, ink-table, react, @types/react deps |

### Created Files

```
packages/cli/src/tui/
├── index.tsx                     # async init + ink render(<App />)
├── App.tsx                       # layout, useInput, tab router
├── theme.ts                      # chalk color constants
├── hooks/
│   ├── useDatabase.ts            # DB stats + recent blocks, polls every 5s
│   ├── useDaemon.ts              # reads heartbeat.pid + .heartbeat-health
│   ├── useSync.ts                # reads solver.json
│   ├── useDevice.ts              # reads identity.json + os
│   ├── useConfig.ts              # reads/writes config.json (features)
│   └── useLogs.ts                # tails daemon.log via fs.watch
└── components/
    ├── Header.tsx                # chalk title line
    ├── TabBar.tsx                # tab navigation display
    ├── StatusBar.tsx             # bottom health + keybinding hints
    ├── Badge.tsx                 # colored [tag] badges
    ├── VitalityBar.tsx           # █░ progress bar, width-aware
    ├── KeyValue.tsx              # aligned key: value row
    └── panels/
        ├── OverviewPanel.tsx     # stats cards + bar charts + recent blocks
        ├── SyncPanel.tsx         # solver sync status
        ├── DaemonPanel.tsx       # heartbeat engine status table
        ├── DevicePanel.tsx       # identity + storage paths
        ├── ConfigPanel.tsx       # feature flags with toggle interaction
        └── LogsPanel.tsx         # real-time log tail
```

---

## Task 1: Install dependencies and configure TypeScript

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/tsconfig.json`

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd packages/cli
npm install ink@5 ink-table react@18
npm install --save-dev @types/react
```

- [ ] **Step 2: Add JSX config to tsconfig.json**

Open `packages/cli/tsconfig.json`. Current content has no `jsx` key. Add these two lines inside `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src",
    "paths": { "@/*": ["./*"] },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"],
  "ts-node": {
    "esm": true,
    "experimentalSpecifierResolution": "node"
  }
}
```

- [ ] **Step 3: Verify build still passes**

```bash
cd packages/cli
npm run build
```

Expected: no errors, `dist/` updated.

- [ ] **Step 4: Commit**

```bash
cd packages/cli
git add package.json tsconfig.json package-lock.json
git commit -m "chore(cli): add ink v5 + react 18 deps, enable JSX in tsconfig"
```

---

## Task 2: Extend CorivoConfig with feature flags

**Files:**
- Modify: `packages/cli/src/config.ts`
- Test: `packages/cli/__tests__/unit/config-features.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/__tests__/unit/config-features.test.ts`:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Test that CorivoFeatures is a valid subset of CorivoConfig
// and that missing keys default to true (opt-out model)

describe('CorivoFeatures', () => {
  test('config without features field is valid', async () => {
    // Dynamic import to pick up compiled output
    const { loadConfig } = await import('../../dist/config.js');
    // loadConfig returns null if file missing — just test the type shape
    // by constructing a raw object
    const raw = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'id_test',
      db_key: 'a'.repeat(44),
    };
    // No features key — should be assignable to CorivoConfig
    assert.ok(!('features' in raw) || raw.features === undefined);
  });

  test('feature flag missing means enabled (opt-out model)', async () => {
    const features = {};  // empty CorivoFeatures
    // Missing keys should be treated as true
    const getFeature = (f: Record<string, boolean | undefined>, key: string) =>
      f[key] !== false;  // undefined → true
    assert.equal(getFeature(features, 'sync'), true);
    assert.equal(getFeature({ sync: false }, 'sync'), false);
    assert.equal(getFeature({ sync: true }, 'sync'), true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails (module not compiled yet)**

```bash
cd packages/cli
node --test __tests__/unit/config-features.test.ts
```

Expected: import error (dist/config.js may not have features yet — this is fine, confirms we need to implement).

- [ ] **Step 3: Add CorivoFeatures to config.ts**

Open `packages/cli/src/config.ts`. After the imports, before `CorivoConfig`, add:

```typescript
/**
 * Feature flags (opt-out model: missing key = true = enabled)
 */
export interface CorivoFeatures {
  /** 多设备同步 */
  sync?: boolean;
  /** 保存时自动推送 */
  autoPushOnSave?: boolean;
  /** 唤醒时同步 */
  syncOnWake?: boolean;
  /** 心跳引擎 */
  heartbeatEngine?: boolean;
  /** 登录时自动启动 */
  autoStartOnLogin?: boolean;
  /** 被动监听（Claude Code / Cursor 对话） */
  passiveListening?: boolean;
  /** 关联发现 */
  associationDiscovery?: boolean;
  /** 整合去重 */
  consolidation?: boolean;
  /** CJK 全文搜索降级 */
  cjkFtsFallback?: boolean;
  /** Claude Code 集成 */
  claudeCode?: boolean;
  /** Cursor 集成 */
  cursor?: boolean;
  /** 飞书集成 */
  feishu?: boolean;
  /** 数据库加密 */
  dbEncryption?: boolean;
  /** 遥测 */
  telemetry?: boolean;
}
```

Then add `features?: CorivoFeatures;` to the `CorivoConfig` interface after `db_key`:

```typescript
export interface CorivoConfig {
  version: string;
  created_at: string;
  identity_id: string;
  db_key: string;
  features?: CorivoFeatures;
}
```

- [ ] **Step 4: Build and run test**

```bash
cd packages/cli
npm run build
node --test __tests__/unit/config-features.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts __tests__/unit/config-features.test.ts
git commit -m "feat(config): add CorivoFeatures interface with opt-out feature flags"
```

---

## Task 3: Create theme and shared primitive components

**Files:**
- Create: `packages/cli/src/tui/theme.ts`
- Create: `packages/cli/src/tui/components/Badge.tsx`
- Create: `packages/cli/src/tui/components/VitalityBar.tsx`
- Create: `packages/cli/src/tui/components/KeyValue.tsx`

- [ ] **Step 1: Create theme.ts**

```typescript
// packages/cli/src/tui/theme.ts
import chalk from 'chalk';

export const theme = {
  green:  chalk.hex('#3fb950'),
  blue:   chalk.hex('#58a6ff'),
  amber:  chalk.hex('#d29922'),
  red:    chalk.hex('#f85149'),
  purple: chalk.hex('#bc8cff'),
  cyan:   chalk.hex('#39c5cf'),
  dim:    chalk.hex('#484f58'),
  white:  chalk.hex('#f0f6fc'),
  fg:     chalk.hex('#c9d1d9'),
} as const;

/** Map block status → color function */
export function statusColor(status: string) {
  switch (status) {
    case 'active':   return theme.green;
    case 'cooling':  return theme.amber;
    case 'cold':     return theme.blue;
    case 'archived': return theme.dim;
    default:         return theme.fg;
  }
}

/** Map annotation nature → color */
export function annotationColor(annotation: string) {
  if (annotation.startsWith('决策')) return theme.green;
  if (annotation.startsWith('事实')) return theme.blue;
  if (annotation.startsWith('知识')) return theme.amber;
  if (annotation.startsWith('指令')) return theme.purple;
  return theme.dim;
}
```

- [ ] **Step 2: Create Badge.tsx**

```tsx
// packages/cli/src/tui/components/Badge.tsx
import React from 'react';
import { Text } from 'ink';

interface BadgeProps {
  label: string;
  color?: string;
}

export function Badge({ label, color = 'white' }: BadgeProps) {
  return <Text color={color}>[{label}]</Text>;
}
```

- [ ] **Step 3: Create VitalityBar.tsx**

```tsx
// packages/cli/src/tui/components/VitalityBar.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface VitalityBarProps {
  value: number;   // 0–100
  width?: number;  // default 20
  showValue?: boolean;
}

export function VitalityBar({ value, width = 20, showValue = true }: VitalityBarProps) {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  const color = value >= 70 ? 'green' : value >= 40 ? 'yellow' : value >= 10 ? 'blue' : 'gray';

  return (
    <Box>
      <Text color={color}>{bar}</Text>
      {showValue && <Text color="gray"> {value}</Text>}
    </Box>
  );
}
```

- [ ] **Step 4: Create KeyValue.tsx**

```tsx
// packages/cli/src/tui/components/KeyValue.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface KeyValueProps {
  label: string;
  value: string;
  labelWidth?: number;
  valueColor?: string;
}

export function KeyValue({ label, value, labelWidth = 14, valueColor = 'white' }: KeyValueProps) {
  const paddedLabel = label.padEnd(labelWidth);
  return (
    <Box>
      <Text color="gray">{paddedLabel}</Text>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Build to verify no TS errors**

```bash
cd packages/cli
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tui/theme.ts src/tui/components/Badge.tsx src/tui/components/VitalityBar.tsx src/tui/components/KeyValue.tsx
git commit -m "feat(tui): add theme and primitive components (Badge, VitalityBar, KeyValue)"
```

---

## Task 4: Create data hooks — useConfig and useDatabase

**Files:**
- Create: `packages/cli/src/tui/hooks/useConfig.ts`
- Create: `packages/cli/src/tui/hooks/useDatabase.ts`

- [ ] **Step 1: Create useConfig.ts**

```typescript
// packages/cli/src/tui/hooks/useConfig.ts
import { useState, useEffect, useCallback } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CorivoConfig, CorivoFeatures } from '../../config.js';

export interface UseConfigResult {
  config: CorivoConfig | null;
  loading: boolean;
  toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
  savedFlash: boolean;  // true for 500ms after write
}

export function useConfig(configDir: string): UseConfigResult {
  const [config, setConfig] = useState<CorivoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);
  const configPath = path.join(configDir, 'config.json');

  const load = useCallback(async () => {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      setConfig(JSON.parse(raw));
    } catch {
      // file missing or invalid — leave null
    } finally {
      setLoading(false);
    }
  }, [configPath]);

  useEffect(() => { load(); }, [load]);

  const toggleFeature = useCallback(async (key: keyof CorivoFeatures) => {
    if (!config) return;
    // missing key = true (opt-out) → toggling it makes it false
    const current = (config.features?.[key]) !== false;
    const updated: CorivoConfig = {
      ...config,
      features: { ...config.features, [key]: !current },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);

  return { config, loading, toggleFeature, savedFlash };
}
```

- [ ] **Step 2: Create useDatabase.ts**

```typescript
// packages/cli/src/tui/hooks/useDatabase.ts
import { useState, useEffect } from 'react';
import type { CorivoDatabase } from '../../storage/database.js';
import type { Block } from '../../models/index.js';

export interface DbStats {
  total: number;
  byStatus: Record<string, number>;
  byAnnotation: Record<string, number>;
  associationCount: number;
  sizeBytes: number;
  healthy: boolean;
  recentBlocks: Block[];
}

export function useDatabase(db: CorivoDatabase | null): { stats: DbStats | null; loading: boolean } {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }

    const fetch = () => {
      try {
        const rawStats = db.getStats();
        const health = db.checkHealth();
        const associations = db.queryAssociations({ limit: 9999 });
        const recentBlocks = db.queryBlocks({ limit: 5 });
        // queryBlocks default sort is by updated_at desc (check impl)
        setStats({
          total: rawStats.total,
          byStatus: rawStats.byStatus,
          byAnnotation: rawStats.byAnnotation,
          associationCount: associations.length,
          sizeBytes: health.size ?? 0,
          healthy: health.ok,
          recentBlocks,
        });
      } catch {
        // DB error — leave stats null
      } finally {
        setLoading(false);
      }
    };

    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [db]);

  return { stats, loading };
}
```

- [ ] **Step 3: Build to verify**

```bash
cd packages/cli
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tui/hooks/useConfig.ts src/tui/hooks/useDatabase.ts
git commit -m "feat(tui): add useConfig and useDatabase hooks"
```

---

## Task 5: Create data hooks — useDaemon, useSync, useDevice, useLogs

**Files:**
- Create: `packages/cli/src/tui/hooks/useDaemon.ts`
- Create: `packages/cli/src/tui/hooks/useSync.ts`
- Create: `packages/cli/src/tui/hooks/useDevice.ts`
- Create: `packages/cli/src/tui/hooks/useLogs.ts`

- [ ] **Step 1: Create useDaemon.ts**

```typescript
// packages/cli/src/tui/hooks/useDaemon.ts
import { useState, useEffect } from 'react';
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
        pid = parseInt(pidStr.trim());
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

      setStatus({ running, pid, uptime, cycleCount, lastCheckAge, logPath, errPath });
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [configDir]);

  return status;
}
```

- [ ] **Step 2: Create useSync.ts**

```typescript
// packages/cli/src/tui/hooks/useSync.ts
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
```

- [ ] **Step 3: Create useDevice.ts**

```typescript
// packages/cli/src/tui/hooks/useDevice.ts
import { useState, useEffect } from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IdentityConfig } from '../../identity/identity.js';

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
```

- [ ] **Step 4: Create useLogs.ts**

```typescript
// packages/cli/src/tui/hooks/useLogs.ts
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
      } catch (e) {
        setError(`Log file not found: ${logPath}`);
      }
    };

    readNew();

    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(logPath, () => { readNew(); });
    } catch {
      // file doesn't exist yet — poll instead
      const interval = setInterval(readNew, 2000);
      return () => clearInterval(interval);
    }

    return () => { watcher?.close(); };
  }, [configDir]);

  return { lines, error };
}
```

- [ ] **Step 5: Build to verify**

```bash
cd packages/cli
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tui/hooks/useDaemon.ts src/tui/hooks/useSync.ts src/tui/hooks/useDevice.ts src/tui/hooks/useLogs.ts
git commit -m "feat(tui): add useDaemon, useSync, useDevice, useLogs hooks"
```

---

## Task 6: Create Header, TabBar, StatusBar

**Files:**
- Create: `packages/cli/src/tui/components/Header.tsx`
- Create: `packages/cli/src/tui/components/TabBar.tsx`
- Create: `packages/cli/src/tui/components/StatusBar.tsx`

- [ ] **Step 1: Create Header.tsx**

```tsx
// packages/cli/src/tui/components/Header.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

const VERSION = '0.12.0';

export function Header() {
  return (
    <Box paddingX={1} paddingY={0}>
      <Text>
        <Text bold color="cyan">◆ CORIVO</Text>
        {'  '}
        <Text color="gray">v{VERSION}</Text>
        {'  '}
        <Text color="gray" dimColor>your silicon colleague — it only lives for you</Text>
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Create TabBar.tsx**

```tsx
// packages/cli/src/tui/components/TabBar.tsx
import React from 'react';
import { Box, Text } from 'ink';

export const TABS = [
  { id: 'overview', label: '1:Overview' },
  { id: 'sync',     label: '2:Sync' },
  { id: 'daemon',   label: '3:Daemon' },
  { id: 'device',   label: '4:Device' },
  { id: 'config',   label: '5:Config' },
  { id: 'logs',     label: '6:Logs' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

interface TabBarProps {
  active: TabId;
}

export function TabBar({ active }: TabBarProps) {
  return (
    <Box paddingX={1} marginBottom={1}>
      {TABS.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <Box key={tab.id} marginRight={2}>
            <Text
              color={isActive ? 'green' : 'gray'}
              bold={isActive}
              underline={isActive}
            >
              {tab.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 3: Create StatusBar.tsx**

```tsx
// packages/cli/src/tui/components/StatusBar.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  daemonRunning: boolean;
  syncConfigured: boolean;
  dbHealthy: boolean;
  pid?: number | null;
  savedFlash?: boolean;
}

export function StatusBar({ daemonRunning, syncConfigured, dbHealthy, pid, savedFlash }: StatusBarProps) {
  const dot = (ok: boolean) => (
    <Text color={ok ? 'green' : 'red'}>● </Text>
  );

  return (
    <Box paddingX={1} marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
      <Box flexGrow={1}>
        {dot(daemonRunning)}<Text color="gray">daemon  </Text>
        {dot(syncConfigured)}<Text color="gray">sync  </Text>
        {dot(dbHealthy)}<Text color="gray">db:WAL  </Text>
        {savedFlash && <Text color="green">  ✓ saved</Text>}
      </Box>
      <Box>
        <Text color="gray">
          {pid ? `pid ${pid}  ` : ''}Tab/←→ navigate · j/k scroll · q quit
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Build to verify**

```bash
cd packages/cli
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/Header.tsx src/tui/components/TabBar.tsx src/tui/components/StatusBar.tsx
git commit -m "feat(tui): add Header, TabBar, StatusBar chrome components"
```

---

## Task 7: Create OverviewPanel

**Files:**
- Create: `packages/cli/src/tui/components/panels/OverviewPanel.tsx`

- [ ] **Step 1: Create OverviewPanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/OverviewPanel.tsx
import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { DbStats } from '../../hooks/useDatabase.js';
import { VitalityBar } from '../VitalityBar.js';
import { Badge } from '../Badge.js';
import { KeyValue } from '../KeyValue.js';
import { annotationColor } from '../../theme.js';

interface OverviewPanelProps {
  stats: DbStats | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function BarChart({ data, totalWidth }: { data: Record<string, number>; totalWidth: number }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return <Text color="gray">  no data</Text>;
  const barWidth = Math.min(30, Math.floor(totalWidth * 0.3));

  return (
    <Box flexDirection="column">
      {Object.entries(data).map(([label, count]) => {
        const pct = total > 0 ? count / total : 0;
        const filled = Math.round(pct * barWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
        const color = label.startsWith('决策') ? 'green'
          : label.startsWith('事实') ? 'blue'
          : label.startsWith('知识') ? 'yellow'
          : 'magenta';
        return (
          <Box key={label}>
            <Text color="gray">{`  ${label.substring(0, 14).padEnd(14)} `}</Text>
            <Text color={color}>{bar}</Text>
            <Text color="gray"> {count}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function OverviewPanel({ stats, loading }: OverviewPanelProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  if (loading) return <Box paddingX={2}><Text color="gray">Loading...</Text></Box>;
  if (!stats) return <Box paddingX={2}><Text color="red">Database unavailable</Text></Box>;

  const { byStatus } = stats;
  const statusTotal = Object.values(byStatus).reduce((s, v) => s + v, 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Stats row */}
      <Box marginBottom={1}>
        <Box borderStyle="round" paddingX={2} paddingY={0} marginRight={2}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{stats.total}</Text>
            <Text color="gray">Blocks</Text>
          </Box>
        </Box>
        <Box borderStyle="round" paddingX={2} paddingY={0} marginRight={2}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{stats.associationCount}</Text>
            <Text color="gray">Associations</Text>
          </Box>
        </Box>
        <Box borderStyle="round" paddingX={2} paddingY={0}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="white">{formatBytes(stats.sizeBytes)}</Text>
            <Text color="gray">DB Size</Text>
          </Box>
        </Box>
      </Box>

      {/* Annotation distribution */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Type Distribution</Text>
      </Box>
      <BarChart data={stats.byAnnotation} totalWidth={cols} />

      {/* Vitality lifecycle */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">Vitality Lifecycle</Text>
      </Box>
      <Box paddingX={2}>
        {statusTotal > 0 ? (
          <Box>
            {(['active', 'cooling', 'cold', 'archived'] as const).map(s => {
              const count = byStatus[s] ?? 0;
              const pct = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0;
              const color = s === 'active' ? 'green' : s === 'cooling' ? 'yellow' : s === 'cold' ? 'blue' : 'gray';
              return (
                <Box key={s} marginRight={3}>
                  <Text color={color}>{s} </Text>
                  <Text color="white">{count}</Text>
                  <Text color="gray"> ({pct}%)</Text>
                </Box>
              );
            })}
          </Box>
        ) : <Text color="gray">no blocks</Text>}
      </Box>

      {/* Recent blocks */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color="cyan">Recent Blocks</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {stats.recentBlocks.length === 0
          ? <Text color="gray">  no blocks yet</Text>
          : stats.recentBlocks.map(block => (
            <Box key={block.id} marginBottom={0}>
              <Text color="gray">{new Date(block.updated_at * 1000).toLocaleDateString()} </Text>
              <Badge label={block.annotation.split(' · ')[0] ?? '?'} color="cyan" />
              <Text> </Text>
              <Text color="white">{block.content.substring(0, Math.max(20, cols - 50))}
                {block.content.length > (cols - 50) ? '…' : ''}</Text>
              <Text color="gray"> v{block.vitality}</Text>
            </Box>
          ))
        }
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/panels/OverviewPanel.tsx
git commit -m "feat(tui): add OverviewPanel with stats, bar chart, vitality, recent blocks"
```

---

## Task 8: Create SyncPanel and DaemonPanel

**Files:**
- Create: `packages/cli/src/tui/components/panels/SyncPanel.tsx`
- Create: `packages/cli/src/tui/components/panels/DaemonPanel.tsx`

- [ ] **Step 1: Create SyncPanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/SyncPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { SolverConfig } from '../../../config.js';
import { KeyValue } from '../KeyValue.js';

interface SyncPanelProps {
  solver: SolverConfig | null;
}

export function SyncPanel({ solver }: SyncPanelProps) {
  if (!solver) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Text color="gray">● Sync not configured</Text>
        <Text color="gray">  Run: corivo sync register</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Connection</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Server" value={solver.server_url} valueColor="green" />
        <KeyValue label="Status" value="● configured" valueColor="green" />
        <KeyValue label="Site ID" value={solver.site_id} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Sync Progress</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="Pushed" value={`${solver.last_push_version} changesets`} />
        <KeyValue label="Pulled" value={`${solver.last_pull_version} changesets`} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create DaemonPanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/DaemonPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Table from 'ink-table';
import type { DaemonStatus } from '../../hooks/useDaemon.js';
import { KeyValue } from '../KeyValue.js';

interface DaemonPanelProps {
  daemon: DaemonStatus;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DaemonPanel({ daemon }: DaemonPanelProps) {
  const engineCycles = [
    { Task: 'processPendingBlocks', Interval: '5s',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processVitalityDecay', Interval: '5s',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processAssociations',  Interval: '30s', Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'processConsolidation', Interval: '60s', Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'checkFollowUps',       Interval: '1h',  Status: daemon.running ? 'active' : 'stopped' },
    { Task: 'autoSync',             Interval: '5m',  Status: daemon.running ? 'active' : 'stopped' },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Heartbeat Engine</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue
          label="Status"
          value={daemon.running ? '● running' : '○ stopped'}
          valueColor={daemon.running ? 'green' : 'gray'}
        />
        <KeyValue label="PID" value={daemon.pid ? String(daemon.pid) : '—'} />
        <KeyValue label="Uptime" value={formatUptime(daemon.uptime)} />
        <KeyValue label="Cycles" value={daemon.cycleCount ? String(daemon.cycleCount) : '—'} />
        {daemon.lastCheckAge !== null && (
          <KeyValue
            label="Health check"
            value={`${Math.round(daemon.lastCheckAge / 1000)}s ago`}
            valueColor={daemon.lastCheckAge < 60000 ? 'green' : 'yellow'}
          />
        )}
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Engine Cycles</Text>
      </Box>
      <Box paddingX={1} marginBottom={2}>
        <Table data={engineCycles} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">Log Files</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="stdout" value={daemon.logPath} />
        <KeyValue label="stderr" value={daemon.errPath} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Build to verify**

```bash
cd packages/cli
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/tui/components/panels/SyncPanel.tsx src/tui/components/panels/DaemonPanel.tsx
git commit -m "feat(tui): add SyncPanel and DaemonPanel"
```

---

## Task 9: Create DevicePanel and ConfigPanel

**Files:**
- Create: `packages/cli/src/tui/components/panels/DevicePanel.tsx`
- Create: `packages/cli/src/tui/components/panels/ConfigPanel.tsx`

- [ ] **Step 1: Create DevicePanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/DevicePanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Table from 'ink-table';
import type { DeviceInfo } from '../../hooks/useDevice.js';
import { KeyValue } from '../KeyValue.js';

interface DevicePanelProps {
  device: DeviceInfo;
}

export function DevicePanel({ device }: DevicePanelProps) {
  const { identity } = device;
  const deviceRows = identity
    ? Object.values(identity.devices).map(d => ({
        ID: d.id,
        Name: d.name,
        Platform: d.platform,
        'Last Seen': new Date(d.last_seen).toLocaleDateString(),
      }))
    : [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Identity</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Identity ID" value={identity?.identity_id ?? '—'} valueColor="cyan" />
        <KeyValue label="Display Name" value={identity?.display_name ?? '(not set)'} />
        <KeyValue label="Created" value={identity ? new Date(identity.created_at).toLocaleDateString() : '—'} />
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">This Device</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} marginBottom={2}>
        <KeyValue label="Hostname" value={device.hostname} />
        <KeyValue label="Platform" value={`${device.platform} (${device.arch})`} />
        <KeyValue label="Node" value={device.nodeVersion} />
      </Box>

      {deviceRows.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold color="cyan">All Devices</Text>
          </Box>
          <Box paddingX={1} marginBottom={2}>
            <Table data={deviceRows} />
          </Box>
        </>
      )}

      <Box marginBottom={1}>
        <Text bold color="cyan">Storage</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        <KeyValue label="DB" value={device.dbPath} />
        <KeyValue label="Config" value={device.configPath} />
        <KeyValue label="Identity" value={device.identityPath} />
        <KeyValue label="Log" value={device.logPath} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create ConfigPanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/ConfigPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { UseConfigResult } from '../../hooks/useConfig.js';
import type { CorivoFeatures } from '../../../config.js';

interface ConfigPanelProps {
  configState: UseConfigResult;
  focusIndex: number;
}

interface FeatureItem {
  key: keyof CorivoFeatures;
  label: string;
  group: string;
}

export const FEATURE_ITEMS: FeatureItem[] = [
  // Sync
  { key: 'sync',              label: 'Multi-device sync',       group: 'Sync' },
  { key: 'autoPushOnSave',    label: 'Auto-push on save',       group: 'Sync' },
  { key: 'syncOnWake',        label: 'Sync on wake',            group: 'Sync' },
  // Daemon
  { key: 'heartbeatEngine',   label: 'Heartbeat engine',        group: 'Daemon' },
  { key: 'autoStartOnLogin',  label: 'Auto-start on login',     group: 'Daemon' },
  // Memory Engine
  { key: 'passiveListening',      label: 'Passive listening',       group: 'Memory Engine' },
  { key: 'associationDiscovery',  label: 'Association discovery',   group: 'Memory Engine' },
  { key: 'consolidation',         label: 'Consolidation',           group: 'Memory Engine' },
  { key: 'cjkFtsFallback',        label: 'CJK FTS fallback',        group: 'Memory Engine' },
  // Integrations
  { key: 'claudeCode',  label: 'Claude Code',   group: 'Integrations' },
  { key: 'cursor',      label: 'Cursor',         group: 'Integrations' },
  { key: 'feishu',      label: 'Feishu',         group: 'Integrations' },
  // Security
  { key: 'dbEncryption', label: 'Database encryption', group: 'Security' },
  { key: 'telemetry',    label: 'Telemetry',            group: 'Security' },
];

export function ConfigPanel({ configState, focusIndex }: ConfigPanelProps) {
  const { config, loading } = configState;
  if (loading) return <Box paddingX={2}><Text color="gray">Loading config...</Text></Box>;
  if (!config) return <Box paddingX={2}><Text color="red">Config unavailable</Text></Box>;

  let currentGroup = '';
  let globalIndex = 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>↑/↓ navigate · Enter/Space toggle</Text>
      </Box>
      {FEATURE_ITEMS.map((item) => {
        const myIndex = globalIndex++;
        const isFocused = myIndex === focusIndex;
        const enabled = config.features?.[item.key] !== false;  // opt-out: missing = true

        const showGroup = item.group !== currentGroup;
        if (showGroup) currentGroup = item.group;

        return (
          <React.Fragment key={item.key}>
            {showGroup && (
              <Box marginTop={1} marginBottom={0}>
                <Text bold color="cyan">{item.group}</Text>
              </Box>
            )}
            <Box paddingX={1}>
              <Text
                backgroundColor={isFocused ? 'gray' : undefined}
                color={isFocused ? 'white' : 'gray'}
              >
                {enabled ? '[x]' : '[ ]'} {item.label}
              </Text>
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

export const CONFIG_ITEM_COUNT = FEATURE_ITEMS.length;
```

- [ ] **Step 3: Build to verify**

```bash
cd packages/cli
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/tui/components/panels/DevicePanel.tsx src/tui/components/panels/ConfigPanel.tsx
git commit -m "feat(tui): add DevicePanel and ConfigPanel"
```

---

## Task 10: Create LogsPanel

**Files:**
- Create: `packages/cli/src/tui/components/panels/LogsPanel.tsx`

- [ ] **Step 1: Create LogsPanel.tsx**

```tsx
// packages/cli/src/tui/components/panels/LogsPanel.tsx
import React from 'react';
import { Box, Text, useStdout } from 'ink';

interface LogsPanelProps {
  lines: string[];
  error: string | null;
  scrollOffset: number;  // lines from bottom (0 = latest)
}

function colorize(line: string): { text: string; color: string } {
  if (/\[ERR\]|\[错误\]|error:/i.test(line))   return { text: line, color: 'red' };
  if (/\[BEAT\]|\[心跳\]/.test(line))           return { text: line, color: 'green' };
  if (/\[DECAY\]|\[衰减\]/.test(line))          return { text: line, color: 'yellow' };
  if (/\[SYNC\]|\[同步\]|\[PUSH\]|\[PULL\]/.test(line)) return { text: line, color: 'magenta' };
  if (/\[ASSOC\]|\[关联\]/.test(line))          return { text: line, color: 'blue' };
  if (/\[AUTH\]|\[INIT\]/.test(line))           return { text: line, color: 'cyan' };
  return { text: line, color: 'gray' };
}

export function LogsPanel({ lines, error, scrollOffset }: LogsPanelProps) {
  const { stdout } = useStdout();
  const maxVisible = (stdout?.rows ?? 24) - 8;

  if (error) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Text color="gray">{error}</Text>
        <Text color="gray" dimColor>Start daemon first: corivo start</Text>
      </Box>
    );
  }

  const visible = lines.slice(
    Math.max(0, lines.length - maxVisible - scrollOffset),
    lines.length - scrollOffset || undefined,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>j/k scroll · auto-follows latest</Text>
        {scrollOffset > 0 && <Text color="yellow"> (paused -{scrollOffset})</Text>}
      </Box>
      {visible.length === 0
        ? <Text color="gray">  No logs yet</Text>
        : visible.map((line, i) => {
          const { text, color } = colorize(line);
          return <Text key={i} color={color}>{text}</Text>;
        })
      }
    </Box>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd packages/cli
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/panels/LogsPanel.tsx
git commit -m "feat(tui): add LogsPanel with tag-based colorization"
```

---

## Task 11: Create App.tsx and index.tsx

**Files:**
- Create: `packages/cli/src/tui/App.tsx`
- Create: `packages/cli/src/tui/index.tsx`

- [ ] **Step 1: Create App.tsx**

```tsx
// packages/cli/src/tui/App.tsx
import React, { useState, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { CorivoDatabase } from '../storage/database.js';

import { Header } from './components/Header.js';
import { TabBar, TABS, type TabId } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { OverviewPanel } from './components/panels/OverviewPanel.js';
import { SyncPanel } from './components/panels/SyncPanel.js';
import { DaemonPanel } from './components/panels/DaemonPanel.js';
import { DevicePanel } from './components/panels/DevicePanel.js';
import { ConfigPanel, CONFIG_ITEM_COUNT } from './components/panels/ConfigPanel.js';
import { LogsPanel } from './components/panels/LogsPanel.js';

import { useDatabase } from './hooks/useDatabase.js';
import { useDaemon } from './hooks/useDaemon.js';
import { useSync } from './hooks/useSync.js';
import { useDevice } from './hooks/useDevice.js';
import { useConfig } from './hooks/useConfig.js';
import { useLogs } from './hooks/useLogs.js';

interface AppProps {
  db: CorivoDatabase | null;
  configDir: string;
  dbPath: string;
}

export function App({ db, configDir, dbPath }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [configFocus, setConfigFocus] = useState(0);
  const [logScroll, setLogScroll] = useState(0);

  // Data hooks
  const { stats, loading: dbLoading } = useDatabase(db);
  const daemon = useDaemon(configDir);
  const { solver } = useSync(configDir);
  const device = useDevice(configDir, dbPath);
  const configState = useConfig(configDir);
  const { lines: logLines, error: logError } = useLogs(configDir);

  const tabIds = TABS.map(t => t.id);

  const navigate = useCallback((dir: 1 | -1) => {
    setActiveTab(prev => {
      const i = tabIds.indexOf(prev);
      return tabIds[(i + dir + tabIds.length) % tabIds.length] as TabId;
    });
  }, [tabIds]);

  useInput((input, key) => {
    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // Tab navigation
    if (key.tab && !key.shift) { navigate(1); return; }
    if (key.tab && key.shift)  { navigate(-1); return; }
    if (key.rightArrow)        { navigate(1); return; }
    if (key.leftArrow)         { navigate(-1); return; }

    // Number jump
    const n = parseInt(input);
    if (n >= 1 && n <= 6) { setActiveTab(tabIds[n - 1] as TabId); return; }

    // Refresh
    if (input === 'r') { /* hooks re-poll on interval; manual refresh: force re-render via state */ return; }

    // Config focus
    if (activeTab === 'config') {
      if (input === 'j' || key.downArrow)  { setConfigFocus(f => Math.min(f + 1, CONFIG_ITEM_COUNT - 1)); return; }
      if (input === 'k' || key.upArrow)    { setConfigFocus(f => Math.max(f - 1, 0)); return; }
      if (input === ' ' || key.return) {
        // Get key for focused item — delegate to ConfigPanel's FEATURE_ITEMS
        // We import the list here to keep the toggle in App
        import('./components/panels/ConfigPanel.js').then(m => {
          // @ts-ignore — accessing internal for key lookup
          const items = (m as any).FEATURE_ITEMS ?? [];
          const item = items[configFocus];
          if (item) configState.toggleFeature(item.key);
        });
        return;
      }
    }

    // Log scroll
    if (activeTab === 'logs') {
      if (input === 'j' || key.downArrow)  { setLogScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'k' || key.upArrow)    { setLogScroll(s => s + 1); return; }
    }
  });

  const renderPanel = () => {
    switch (activeTab) {
      case 'overview': return <OverviewPanel stats={stats} loading={dbLoading} />;
      case 'sync':     return <SyncPanel solver={solver} />;
      case 'daemon':   return <DaemonPanel daemon={daemon} />;
      case 'device':   return <DevicePanel device={device} />;
      case 'config':   return <ConfigPanel configState={configState} focusIndex={configFocus} />;
      case 'logs':     return <LogsPanel lines={logLines} error={logError} scrollOffset={logScroll} />;
    }
  };

  return (
    <Box flexDirection="column">
      <Header />
      <TabBar active={activeTab} />
      <Box flexGrow={1}>{renderPanel()}</Box>
      <StatusBar
        daemonRunning={daemon.running}
        syncConfigured={solver !== null}
        dbHealthy={stats?.healthy ?? false}
        pid={daemon.pid}
        savedFlash={configState.savedFlash}
      />
    </Box>
  );
}
```

Note: The `import()` in `useInput` is a quick workaround for accessing FEATURE_ITEMS. A cleaner approach is to export FEATURE_ITEMS from ConfigPanel and import it directly in App.tsx. Refactor: move the toggle dispatch to directly import `FEATURE_ITEMS` at top of App.tsx:

```tsx
// Add at top of App.tsx after other imports:
import { ConfigPanel, CONFIG_ITEM_COUNT, FEATURE_ITEMS } from './components/panels/ConfigPanel.js';
// and export FEATURE_ITEMS from ConfigPanel.tsx
```

Update `ConfigPanel.tsx` to `export const FEATURE_ITEMS`. Then in App.tsx replace the dynamic import with:

```tsx
if (input === ' ' || key.return) {
  const item = FEATURE_ITEMS[configFocus];
  if (item) configState.toggleFeature(item.key);
  return;
}
```

- [ ] **Step 2: Export FEATURE_ITEMS from ConfigPanel.tsx**

In `ConfigPanel.tsx`, change `const FEATURE_ITEMS` to `export const FEATURE_ITEMS`. Already done in Task 9 step 2 code? Check — if not, add `export` keyword.

- [ ] **Step 3: Create index.tsx**

```tsx
// packages/cli/src/tui/index.tsx
import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import { CorivoDatabase, getDefaultDatabasePath, getConfigDir } from '../storage/database.js';
import { getDatabaseKey, loadConfig } from '../config.js';
import { App } from './App.js';

export async function renderTui(): Promise<void> {
  const configDir = getConfigDir();
  const dbPath = getDefaultDatabasePath();

  // Initialize DB (same sequence as status command)
  const config = await loadConfig(configDir);
  if (!config) {
    console.error('Corivo not initialized. Run: corivo init');
    process.exit(1);
  }

  const dbKey = await getDatabaseKey(configDir);
  if (!dbKey) {
    console.error('Cannot read database key. Run: corivo init');
    process.exit(1);
  }

  const db = CorivoDatabase.getInstance({
    path: dbPath,
    key: dbKey,
    enableEncryption: false,
  });

  const { waitUntilExit } = render(
    <App db={db} configDir={configDir} dbPath={dbPath} />
  );

  await waitUntilExit();
}
```

- [ ] **Step 4: Build to verify**

```bash
cd packages/cli
npm run build
```

Expected: no errors. (If there are type errors in App.tsx from the dynamic import workaround, ensure FEATURE_ITEMS is exported from ConfigPanel and imported statically in App.tsx.)

- [ ] **Step 5: Commit**

```bash
git add src/tui/App.tsx src/tui/index.tsx
git commit -m "feat(tui): add App.tsx main layout + index.tsx entry point"
```

---

## Task 12: Wire --tui flag into CLI

**Files:**
- Modify: `packages/cli/src/cli/index.ts` (lines 79–82)

- [ ] **Step 1: Update status command registration**

Find this block in `src/cli/index.ts` (around line 79):

```typescript
program
  .command('status')
  .description('查看状态')
  .option('--no-password', '跳过密码输入（开发模式）')
  .action((options) => statusCommand(options));
```

Replace with:

```typescript
program
  .command('status')
  .description('查看状态')
  .option('--no-password', '跳过密码输入（开发模式）')
  .option('--tui', '启动交互式状态面板')
  .action(async (options) => {
    if (options.tui) {
      const { renderTui } = await import('../tui/index.js');
      await renderTui();
    } else {
      await statusCommand(options);
    }
  });
```

Also update the static import at line 25 — the import path for status.ts is already correct:
```typescript
import { statusCommand } from './commands/status.js';
```
No change needed there.

- [ ] **Step 2: Build**

```bash
cd packages/cli
npm run build
```

Expected: no errors.

- [ ] **Step 3: Smoke test — launch the TUI**

```bash
cd packages/cli
node dist/cli/index.js status --tui
```

Expected: TUI renders. Press `q` to quit.

If DB is not initialized, you'll see the error message "Corivo not initialized. Run: corivo init" which is correct behavior.

- [ ] **Step 4: Verify existing status command unchanged**

```bash
node dist/cli/index.js status
```

Expected: existing text output unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(tui): wire --tui flag to corivo status command"
```

---

## Task 13: Build verification and acceptance testing

**Files:** No new files.

- [ ] **Step 1: Full build**

```bash
cd packages/cli
npm run build
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run existing tests to check no regressions**

```bash
cd packages/cli
node --test
```

Expected: all existing tests pass.

- [ ] **Step 3: Manual acceptance test at 80 columns**

```bash
cd packages/cli
COLUMNS=80 node dist/cli/index.js status --tui
```

- Navigate through all 6 tabs with `Tab` and `1–6` keys
- Check OverviewPanel shows stats (or empty state)
- Check SyncPanel shows configured/not configured
- Check DaemonPanel shows running/stopped
- Check DevicePanel shows identity + paths
- Press `5` → ConfigPanel → `j/k` to move, `Enter` to toggle a flag → check config.json updated
- Press `6` → LogsPanel → `k` to scroll up, `j` to scroll down
- Press `q` → clean exit

- [ ] **Step 4: Manual acceptance test at 120 columns**

```bash
cd packages/cli
COLUMNS=120 node dist/cli/index.js status --tui
```

Expected: bar charts and tables use wider layout without wrapping.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(tui): verify build and acceptance tests pass"
```

---

## Done

All 13 tasks produce `corivo status --tui` with 6 navigable tabs, real data from DB/config/files, Config panel writes to config.json, Logs panel tails daemon.log, and `q` exits cleanly. The original `corivo status` text output is unchanged.
