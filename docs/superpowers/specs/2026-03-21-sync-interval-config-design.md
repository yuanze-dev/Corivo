# Sync Interval Configuration

**Date:** 2026-03-21
**Status:** Approved

## Overview

Make the auto-sync interval configurable instead of hardcoded. Config stored in `~/.corivo/config.json` as raw seconds, TUI exposes 3 preset options for quick switching.

## Requirements

- User can set `syncIntervalSeconds` in `config.json` to any value (manual edit)
- TUI shows 3 presets: 5m / 15m / 30m, cycle with `-` / `+`
- Heartbeat engine reads the value on startup; restart daemon to apply
- Default: 300s (5 minutes)

## Design

### 1. `packages/cli/src/config.ts`

Add `CorivoSettings` interface and `settings` field to `CorivoConfig`:

```typescript
export interface CorivoSettings {
  syncIntervalSeconds?: number; // default 300
}

export interface CorivoConfig {
  version: string;
  created_at: string;
  identity_id: string;
  db_key: string;
  features?: CorivoFeatures;
  settings?: CorivoSettings; // new
}
```

### 2. `packages/cli/src/engine/heartbeat.ts`

Add `private syncCycles = 60` to the class fields.

In `start()`, after resolving config dir (using `process.env.CORIVO_CONFIG_DIR || getConfigDir()` — same pattern as line 96), call `loadConfig()` and compute:

```typescript
const seconds = config?.settings?.syncIntervalSeconds;
if (Number.isFinite(seconds) && seconds > 0) {
  this.syncCycles = Math.max(1, Math.round(seconds / 5));
}
```

Replace hardcoded `% 60` with `% this.syncCycles`.

### 3. `packages/cli/src/tui/hooks/useConfig.ts`

Add `updateSetting` to `UseConfigResult` interface:

```typescript
export interface UseConfigResult {
  config: CorivoConfig | null;
  loading: boolean;
  toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
  updateSetting: (key: keyof CorivoSettings, value: number) => Promise<void>;
  savedFlash: boolean;
}
```

Implement `updateSetting`: writes `config.settings[key] = value` to config.json, triggers `savedFlash`.

### 4. `packages/cli/src/tui/components/ConfigPanel.tsx`

**Focus index system:** The sync interval row is appended after all `FEATURE_ITEMS`. Its global index is `FEATURE_ITEMS.length` (= `CONFIG_ITEM_COUNT` before update). `CONFIG_ITEM_COUNT` is updated to `FEATURE_ITEMS.length + 1`.

In `App.tsx`, the existing lookup `FEATURE_ITEMS[configFocus]` is guarded: only call `toggleFeature` if `configFocus < FEATURE_ITEMS.length`. If `configFocus === FEATURE_ITEMS.length`, the focused row is the sync interval row — `-`/`+` keys apply.

**Sync interval row rendering (when focused):**
```
> Sync interval   5m   - / + cycle · restart to apply
```
When not focused:
```
  Sync interval   5m
```

The row is rendered inside the **Sync** group (after the existing Sync feature items).

**Display format** — add `formatSeconds(s: number): string` utility inside `ConfigPanel.tsx`:
- `s < 60` → `"${s}s"`
- `s % 60 === 0` → `"${s/60}m"`
- otherwise → `"${Math.floor(s/60)}m ${s%60}s"`

**Preset cycling:** presets = `[300, 900, 1800]`. On `+`: find current value in presets, advance to next (wrap). If value not in presets, snap to next preset ≥ current value (or 300 if none). On `-`: reverse direction.

**Hint text:** When focused on sync interval row, the hint line shows `- / + cycle · restart daemon to apply` instead of `↑/↓ navigate · Enter/Space toggle`.

### 5. `packages/cli/src/tui/App.tsx`

In the `config` branch of `useInput`:
- `j`/`k`/`↑`/`↓`: navigate focus (unchanged, bounded by new `CONFIG_ITEM_COUNT`)
- `Space`/`Enter`: only call `toggleFeature` if `configFocus < FEATURE_ITEMS.length`
- `-`: if `configFocus === FEATURE_ITEMS.length`, call `configState.updateSetting('syncIntervalSeconds', prevPreset(current))`
- `+`: if `configFocus === FEATURE_ITEMS.length`, call `configState.updateSetting('syncIntervalSeconds', nextPreset(current))`

`prevPreset`/`nextPreset` helpers are defined in `ConfigPanel.tsx` and exported, or inlined in `App.tsx`.

## Data Flow

```
User presses + in TUI (focused on sync interval row)
  → App.tsx: configFocus === FEATURE_ITEMS.length → nextPreset()
  → configState.updateSetting('syncIntervalSeconds', 900)
  → useConfig writes config.json
  → savedFlash shown
  → on next daemon restart, heartbeat reads new value → syncCycles = 180
```

## Out of Scope

- Dynamic apply without restart
- Configuring other intervals (associations, consolidation)
- Validation UI for manual edits in config.json (heartbeat silently ignores invalid values)
