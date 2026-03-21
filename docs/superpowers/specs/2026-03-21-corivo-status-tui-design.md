# Design: corivo status --tui

**Date:** 2026-03-21
**Status:** Approved
**Package:** `packages/cli`

---

## Overview

Add an interactive TUI panel to the `corivo status` command via a `--tui` flag. Built with ink v5 + React 18, the panel displays real-time Corivo service status across 6 tabs. The existing `corivo status` text output is preserved unchanged.

---

## Architecture

### Entry Point

```
corivo status --tui
    │
    ▼ dynamic import (at runtime only)
src/tui/index.tsx       ← ink render(<App />)
    │
    ▼
App.tsx                  ← layout + useInput keyboard handler + tab router
    ├── Header.tsx        ← chalk title bar
    ├── TabBar.tsx        ← tab navigation (Tab/←→/1-6)
    ├── panels/           ← 6 panel components
    └── StatusBar.tsx     ← bottom health indicators + keybindings hint
```

### File Structure

```
packages/cli/src/tui/
├── index.tsx
├── App.tsx
├── theme.ts                # chalk color constants
├── hooks/
│   ├── useDatabase.ts      # CorivoDatabase stats + recent blocks
│   ├── useDaemon.ts        # pid file + .heartbeat-health
│   ├── useSync.ts          # solver.json
│   ├── useDevice.ts        # identity.json + os
│   ├── useConfig.ts        # config.json read/write (with features)
│   └── useLogs.ts          # tail daemon.log
└── components/
    ├── Header.tsx
    ├── TabBar.tsx
    ├── StatusBar.tsx
    ├── Badge.tsx            # [ok] [idle] [error] colored badges
    ├── VitalityBar.tsx      # █░ progress bar
    ├── KeyValue.tsx         # aligned key-value row
    └── panels/
        ├── OverviewPanel.tsx
        ├── SyncPanel.tsx
        ├── DaemonPanel.tsx
        ├── DevicePanel.tsx
        ├── ConfigPanel.tsx
        └── LogsPanel.tsx
```

---

## Config Schema Extension (Option A)

Extend `CorivoConfig` in `src/config.ts` with an optional `features` field:

```typescript
export interface CorivoFeatures {
  sync?: boolean;
  autoPushOnSave?: boolean;
  syncOnWake?: boolean;
  heartbeatEngine?: boolean;
  autoStartOnLogin?: boolean;
  passiveListening?: boolean;
  associationDiscovery?: boolean;
  consolidation?: boolean;
  cjkFtsGallback?: boolean;
  claudeCode?: boolean;
  cursor?: boolean;
  feishu?: boolean;
  dbEncryption?: boolean;
  telemetry?: boolean;
}

export interface CorivoConfig {
  version: string;
  created_at: string;
  identity_id: string;
  db_key: string;
  features?: CorivoFeatures;  // new optional field, defaults all true
}
```

Missing keys default to `true` (opt-out model). `useConfig` hook reads and writes this field; ConfigPanel renders toggles with `[x]` / `[ ]` style.

---

## Panels

### Tab 1 — Overview

Data source: `useDatabase` (polls every 5s)

- Stats row: Total blocks / Associations count / DB size (fs.statSync)
- Type distribution: bar chart per annotation nature (決策/事実/知識/指令) using `█░` chars, width adapts to terminal columns
- Vitality lifecycle: stacked percentage bar (active/cooling/cold/archived)
- Recent 5 blocks: time + Badge(annotation) + content summary + VitalityBar

### Tab 2 — Sync

Data source: `useSync` (reads solver.json)

- Connection status: server URL, connected/disconnected
- Push/Pull version counts (last_push_version / last_pull_version from solver.json)
- Registered: yes/no

### Tab 3 — Daemon

Data source: `useDaemon` (reads `heartbeat.pid` + `.heartbeat-health`)

`.heartbeat-health` file schema (written every 30s by heartbeat engine):
```json
{
  "pid": 12345,
  "timestamp": 1700000000000,
  "uptime": 3600.5,
  "memory": { "rss": 0, "heapUsed": 0, "heapTotal": 0 },
  "cycleCount": 720
}
```

- Heartbeat status: running/stopped, PID, uptime, cycle count
- Engine cycles table (ink-table): task / interval / status
  - processPendingBlocks: 5s
  - processVitalityDecay: 5s
  - processAssociations: 30s
  - processConsolidation: 60s
- Log paths: daemon.log / daemon.err

### Tab 4 — Device

Data source: `useDevice` (reads identity.json + os module)

- Identity ID, display_name
- Hostname, platform, arch, Node version
- Device list (from identity.devices) via ink-table
- Storage paths: db, config, identity, log

### Tab 5 — Config

Data source: `useConfig` (reads/writes config.json)

- Checkbox list grouped by category, `Enter`/`Space` toggles
- Groups: Sync / Daemon / Memory Engine / Integrations / Security
- Write back to config.json on toggle, StatusBar shows "saved" flash (500ms)
- `j/k` or `↑/↓` to move focus between items

### Tab 6 — Logs

Data source: `useLogs` (fs.watch on daemon.log)

- Streams last 100 lines from `~/.corivo/daemon.log`
- Tag-based coloring: BEAT=green, DECAY=amber, SYNC=purple, ASSOC=blue, ERR=red, INIT=cyan
- Auto-scroll to bottom; `j/k` to scroll manually
- Graceful empty state if log file not found

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Next / previous tab |
| `←` / `→` | Same |
| `1`–`6` | Jump to tab |
| `j/k` or `↑/↓` | Scroll (Logs) or move focus (Config) |
| `Enter` / `Space` | Toggle checkbox (Config) |
| `r` | Force refresh all data |
| `q` / `Ctrl+C` | Quit |

---

## Visual Theme

```typescript
// theme.ts
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
};
```

Header: `◆ CORIVO  v0.12.0  your silicon colleague — it only lives for you`

StatusBar: `● daemon  ● sync  ● db:WAL   v0.12.0 · pid 48291 · Tab/←→ navigate · q quit`

---

## Pre-implementation Steps (Required)

These two changes must happen before writing any TUI code:

### 1. Extend config.ts

Add `CorivoFeatures` interface and `features?` field to `CorivoConfig` in `src/config.ts`:

```typescript
export interface CorivoFeatures {
  sync?: boolean;
  autoPushOnSave?: boolean;
  syncOnWake?: boolean;
  heartbeatEngine?: boolean;
  autoStartOnLogin?: boolean;
  passiveListening?: boolean;
  associationDiscovery?: boolean;
  consolidation?: boolean;
  cjkFtsFallback?: boolean;
  claudeCode?: boolean;
  cursor?: boolean;
  feishu?: boolean;
  dbEncryption?: boolean;
  telemetry?: boolean;
}

export interface CorivoConfig {
  version: string;
  created_at: string;
  identity_id: string;
  db_key: string;
  features?: CorivoFeatures;  // opt-out model: missing key = true
}
```

### 2. Update tsconfig.json

Add JSX support (only affects `.tsx` files, no impact on existing `.ts`):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

---

## Dependencies

```bash
# Runtime
pnpm add ink@5 ink-table react@18

# Dev
pnpm add -D @types/react
```

---

## Constraints

- Terminal width adapts via `useStdout().stdout.columns`; minimum 80 cols
- All data from real files/DB; empty state shown on any read failure, no crash
- `q` cleans up intervals and file watchers before exit
- ESM `.js` extensions on all internal imports
- ink v5 + React 18, no CJS interop needed for TUI code
- `CorivoDatabase.getInstance()` reuses existing singleton — TUI does not open a second connection

---

## Acceptance Criteria

1. `pnpm build` passes with no TS errors
2. `corivo status` (no flag) unchanged
3. `corivo status --tui` launches TUI, all 6 tabs navigable
4. Overview, Sync, Daemon, Device panels show real data
5. Config panel toggles write to config.json
6. Logs panel tails daemon.log in real time
7. `q` exits cleanly
8. Renders correctly at 80 and 120 column widths
