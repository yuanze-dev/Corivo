# Sync Interval Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the auto-sync interval configurable via `config.json`, with 3 presets (5m/15m/30m) selectable from the TUI Config panel using `-`/`+` keys.

**Architecture:** Add `CorivoSettings` to the config type, read it in `Heartbeat.start()` to compute `syncCycles`, expose `updateSetting()` from `useConfig`, and add a sync interval row in `ConfigPanel` with preset cycling.

**Tech Stack:** TypeScript, Node.js, Ink (TUI), Vitest (tests from monorepo root with `pnpm test`)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/cli/src/config.ts` | Modify | Add `CorivoSettings` interface and `settings` field to `CorivoConfig` |
| `packages/cli/src/engine/heartbeat.ts` | Modify | Add `syncCycles` field; read config in `start()` |
| `packages/cli/src/tui/hooks/useConfig.ts` | Modify | Add `updateSetting` to `UseConfigResult` |
| `packages/cli/src/tui/components/panels/ConfigPanel.tsx` | Modify | Add sync interval row, `formatSeconds`, preset helpers, updated hint |
| `packages/cli/src/tui/App.tsx` | Modify | Handle `-`/`+` keys when focused on sync interval row |
| `packages/cli/__tests__/unit/config-settings.test.ts` | Create | Unit tests for `CorivoSettings` default handling |
| `packages/cli/__tests__/integration/heartbeat.test.ts` | Modify | Test `syncCycles` computation from config |

---

## Task 1: Add `CorivoSettings` to config types

**Files:**
- Modify: `packages/cli/src/config.ts`
- Create: `packages/cli/__tests__/unit/config-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/__tests__/unit/config-settings.test.ts`:

```typescript
/**
 * CorivoSettings 配置类型测试
 */
import { describe, it, expect } from 'vitest';
import type { CorivoConfig, CorivoSettings } from '../../src/config';

describe('CorivoSettings', () => {
  it('accepts syncIntervalSeconds in config', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
      settings: { syncIntervalSeconds: 900 },
    };
    expect(config.settings?.syncIntervalSeconds).toBe(900);
  });

  it('treats missing settings as undefined (default 300s applied by consumer)', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
    };
    expect(config.settings).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/airbo/Developer/corivo/Corivo
pnpm test -- --testPathPattern="config-settings" --run
```

Expected: fail — `CorivoSettings` type does not exist yet.

- [ ] **Step 3: Add `CorivoSettings` to `config.ts`**

In `packages/cli/src/config.ts`, after the `CorivoFeatures` interface (around line 44), add:

```typescript
/**
 * Corivo 数值型配置
 */
export interface CorivoSettings {
  /** 自动同步间隔（秒），默认 300（5 分钟） */
  syncIntervalSeconds?: number;
}
```

Then in `CorivoConfig` interface (around line 58), add after `features`:

```typescript
  settings?: CorivoSettings;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/airbo/Developer/corivo/Corivo
pnpm test -- --testPathPattern="config-settings" --run
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/airbo/Developer/corivo/Corivo
git add packages/cli/src/config.ts packages/cli/__tests__/unit/config-settings.test.ts
git commit -m "feat(config): add CorivoSettings with syncIntervalSeconds"
```

---

## Task 2: Make `Heartbeat` respect `syncIntervalSeconds`

**Files:**
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Modify: `packages/cli/__tests__/integration/heartbeat.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/cli/__tests__/integration/heartbeat.test.ts`, add a new `describe` block after the existing ones:

```typescript
describe('syncCycles from config', () => {
  // syncCycles is private — we access it via double-cast for white-box testing.
  // This is intentional: the field has no public accessor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSyncCycles = (hb: Heartbeat) => (hb as any).syncCycles as number;

  it('defaults to 60 cycles (5 minutes) when no settings', () => {
    const hb = new Heartbeat({ db });
    expect(getSyncCycles(hb)).toBe(60);
  });

  it('computes correct cycles for 15 minutes (900s)', () => {
    const hb = new Heartbeat({ db, syncIntervalSeconds: 900 });
    expect(getSyncCycles(hb)).toBe(180);
  });

  it('computes correct cycles for 30 minutes (1800s)', () => {
    const hb = new Heartbeat({ db, syncIntervalSeconds: 1800 });
    expect(getSyncCycles(hb)).toBe(360);
  });

  it('clamps to minimum 1 cycle for absurdly small values', () => {
    const hb = new Heartbeat({ db, syncIntervalSeconds: 1 });
    expect(getSyncCycles(hb)).toBe(1);
  });

  it('ignores invalid (non-finite) values and uses default', () => {
    const hb = new Heartbeat({ db, syncIntervalSeconds: NaN });
    expect(getSyncCycles(hb)).toBe(60);
  });
});
```

> Note: `syncIntervalSeconds` must be added to `HeartbeatConfig` for this to compile — do that in the next step.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/airbo/Developer/corivo/Corivo
pnpm test -- --testPathPattern="heartbeat" --run
```

Expected: type error or FAIL — `syncIntervalSeconds` not in `HeartbeatConfig`, `syncCycles` field missing.

- [ ] **Step 3: Update `HeartbeatConfig` and `Heartbeat` class**

In `packages/cli/src/engine/heartbeat.ts`:

**a) Add to `HeartbeatConfig` interface (around line 31):**
```typescript
  /** 同步间隔秒数（可选，用于测试；生产环境从 config.json 读取） */
  syncIntervalSeconds?: number;
```

**b) Add `syncCycles` to class fields (after `cycleCount`, around line 72):**
```typescript
  private syncCycles = 60; // 默认 5 分钟（60 × 5s）
```

**c) Add a `computeSyncCycles` helper and call it in constructor and `start()`:**

After the constructor body closes (after line 98), the logic goes in two places:

In the **constructor** (to support test injection via `HeartbeatConfig`), add at the end of `constructor`:
```typescript
    // 测试模式：从 config 直接注入 syncIntervalSeconds
    if (config?.syncIntervalSeconds !== undefined) {
      this.syncCycles = this.computeSyncCycles(config.syncIntervalSeconds);
    }
```

Add private helper method (anywhere in the class):
```typescript
  private computeSyncCycles(seconds: number | undefined): number {
    if (!Number.isFinite(seconds) || seconds! <= 0) return 60;
    return Math.max(1, Math.round(seconds! / 5));
  }
```

**d) In `start()`, place the config read _inside_ the `if (!this.db)` block, after `this.autoSync = new AutoSync(this.db)` (around line 130) but before the closing `}` of that block:**

```typescript
      // 从 config.json 读取同步间隔（生产路径；测试模式走构造函数注入，不会进入此块）
      const configDir = process.env.CORIVO_CONFIG_DIR || getConfigDir();
      const corivoConfig = await loadConfig(configDir);
      this.syncCycles = this.computeSyncCycles(corivoConfig?.settings?.syncIntervalSeconds);
```

> Important: this must be inside `if (!this.db)` (the production-only path). In test mode `Heartbeat` is constructed with `{ db }`, so this block is skipped entirely, and `syncCycles` keeps the value set by the constructor from `HeartbeatConfig.syncIntervalSeconds`.

**e) Replace hardcoded `% 60` (line 182):**
```typescript
        if (this.cycleCount % this.syncCycles === 0 && this.db && this.autoSync) {
```

**f) Add import for `loadConfig` at top of file** (it's already imported from `../storage/database.js` — add `loadConfig` from `../config.js`):
```typescript
import { loadConfig } from '../config.js';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/airbo/Developer/corivo/Corivo
pnpm test -- --testPathPattern="heartbeat" --run
```

Expected: PASS (all heartbeat tests including new syncCycles tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/airbo/Developer/corivo/Corivo
git add packages/cli/src/engine/heartbeat.ts packages/cli/__tests__/integration/heartbeat.test.ts
git commit -m "feat(heartbeat): read syncIntervalSeconds from config.json on startup"
```

---

## Task 3: Add `updateSetting` to `useConfig`

> **Depends on Task 1** — `CorivoSettings` type must exist in `config.ts` before this typechecks.

**Files:**
- Modify: `packages/cli/src/tui/hooks/useConfig.ts`

> This hook is React/Ink code — tested manually via TUI. No automated test needed.

- [ ] **Step 1: Update `UseConfigResult` interface**

In `packages/cli/src/tui/hooks/useConfig.ts`, update the interface (around line 6):

```typescript
import type { CorivoConfig, CorivoFeatures, CorivoSettings } from '../../config.js';

export interface UseConfigResult {
  config: CorivoConfig | null;
  loading: boolean;
  toggleFeature: (key: keyof CorivoFeatures) => Promise<void>;
  updateSetting: (key: keyof CorivoSettings, value: number) => Promise<void>;
  savedFlash: boolean;
}
```

- [ ] **Step 2: Implement `updateSetting`**

In `useConfig.ts`, add the implementation after `toggleFeature` (before the return statement, around line 55):

```typescript
  const updateSetting = useCallback(async (key: keyof CorivoSettings, value: number) => {
    if (!config) return;
    const updated: CorivoConfig = {
      ...config,
      settings: { ...config.settings, [key]: value },
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
    setConfig(updated);
    setSavedFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 500);
  }, [config, configPath]);
```

Update the return value:
```typescript
  return { config, loading, toggleFeature, updateSetting, savedFlash };
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/airbo/Developer/corivo/Corivo/packages/cli
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/airbo/Developer/corivo/Corivo
git add packages/cli/src/tui/hooks/useConfig.ts
git commit -m "feat(tui): add updateSetting to useConfig hook"
```

---

## Task 4: Add sync interval row to `ConfigPanel`

**Files:**
- Modify: `packages/cli/src/tui/components/panels/ConfigPanel.tsx`

- [ ] **Step 1: Add `formatSeconds` and preset helpers at the top of the file**

After the imports in `ConfigPanel.tsx`, add:

```typescript
// ─── Sync interval presets ────────────────────────────────────────

const SYNC_PRESETS = [300, 900, 1800] as const; // 5m, 15m, 30m

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function nextSyncPreset(current: number): number {
  const idx = SYNC_PRESETS.indexOf(current as typeof SYNC_PRESETS[number]);
  if (idx === -1) {
    // not a preset: snap to next preset >= current, or wrap to first
    const next = SYNC_PRESETS.find(p => p > current);
    return next ?? SYNC_PRESETS[0];
  }
  return SYNC_PRESETS[(idx + 1) % SYNC_PRESETS.length];
}

export function prevSyncPreset(current: number): number {
  const idx = SYNC_PRESETS.indexOf(current as typeof SYNC_PRESETS[number]);
  if (idx === -1) {
    const prev = [...SYNC_PRESETS].reverse().find(p => p < current);
    return prev ?? SYNC_PRESETS[SYNC_PRESETS.length - 1];
  }
  return SYNC_PRESETS[(idx - 1 + SYNC_PRESETS.length) % SYNC_PRESETS.length];
}
```

- [ ] **Step 2: Update `CONFIG_ITEM_COUNT` and `groupedContentRows`**

Change the export block (around line 34):
```typescript
export const CONFIG_ITEM_COUNT = FEATURE_ITEMS.length + 1; // +1 for sync interval row
export const SYNC_INTERVAL_INDEX = FEATURE_ITEMS.length;   // index of sync interval row
```

Also update `groupedContentRows()` (around line 216) to add 1 for the `SyncIntervalRow` — it lives in the Sync group, so add 1 to the Sync group's item count or simply add 1 to the final total:

```typescript
function groupedContentRows(): number {
  const groups = new Map<string, number>();
  for (const item of FEATURE_ITEMS) {
    groups.set(item.group, (groups.get(item.group) ?? 0) + 1);
  }
  let total = 1; // hint 行
  for (const [group, count] of groups.entries()) {
    const extraRows = group === 'Sync' ? 1 : 0; // SyncIntervalRow
    total += 2 + 1 + count + extraRows + 1; // border×2 + title + items + extra + marginBottom
  }
  return total;
}
```

- [ ] **Step 3: Add `SyncIntervalRow` component**

Add after the `ItemRow` component:

```typescript
function SyncIntervalRow({
  seconds,
  focused,
}: {
  seconds: number;
  focused: boolean;
}) {
  const label = formatSeconds(seconds);
  if (focused) {
    return (
      <Box>
        <Text color="white">{'> '}</Text>
        <Text color="gray">{'Sync interval  '}</Text>
        <Text color="cyan">{label}</Text>
        <Text color="gray" dimColor>{'  - / + cycle'}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="gray">{'  Sync interval  '}</Text>
      <Text color="white">{label}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Update `GroupedView` to include the sync interval row**

In `GroupedView`, the Sync group currently renders `FeatureItem`s. After rendering the Sync group's items, add the `SyncIntervalRow` inside the Sync group's `Box`.

Find the Sync group rendering in `GroupedView`. The groups are rendered with `groups.map(...)`. Update the Sync group to also render the `SyncIntervalRow` after its feature items:

```typescript
function GroupedView({
  config,
  focusIndex,
}: {
  config: NonNullable<UseConfigResult['config']>;
  focusIndex: number;
}) {
  const groups: Array<{ group: string; items: Array<{ item: FeatureItem; gi: number }> }> = [];
  let gi = 0;
  for (const item of FEATURE_ITEMS) {
    let g = groups.find(g => g.group === item.group);
    if (!g) { g = { group: item.group, items: [] }; groups.push(g); }
    g.items.push({ item, gi: gi++ });
  }

  const syncSeconds = config.settings?.syncIntervalSeconds ?? 300;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {focusIndex === SYNC_INTERVAL_INDEX
            ? '↑/↓ navigate · - / + cycle · restart daemon to apply'
            : '↑/↓ navigate · Enter/Space toggle'}
        </Text>
      </Box>
      {groups.map(({ group, items }) => (
        <Box
          key={group}
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
          marginBottom={1}
        >
          <SectionTitle label={group} />
          {items.map(({ item, gi }) => (
            <ItemRow
              key={item.key}
              item={item}
              enabled={config.features?.[item.key] !== false}
              focused={gi === focusIndex}
            />
          ))}
          {group === 'Sync' && (
            <SyncIntervalRow
              seconds={syncSeconds}
              focused={focusIndex === SYNC_INTERVAL_INDEX}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 5: Update `ScrollView` similarly**

In `ScrollView`, the `FLAT_ROWS` drives rendering. Add a synthetic row for sync interval after building `FLAT_ROWS`. The simplest approach: update `buildFlatRows()` to append a sentinel row, and handle it in the render:

Update `buildFlatRows`:
```typescript
function buildFlatRows(): FlatRow[] {
  const rows: FlatRow[] = [];
  let lastGroup = '';
  let gi = 0;
  for (const item of FEATURE_ITEMS) {
    if (item.group !== lastGroup) {
      rows.push({ kind: 'group', label: item.group });
      lastGroup = item.group;
    }
    rows.push({ kind: 'item', item, globalIndex: gi++ });
    // insert sync interval row after last Sync group item
    if (item.group === 'Sync') {
      const nextItem = FEATURE_ITEMS[gi];
      if (!nextItem || nextItem.group !== 'Sync') {
        rows.push({ kind: 'syncInterval' } as unknown as FlatRow);
      }
    }
  }
  return rows;
}
```

Update the `FlatRow` type:
```typescript
type FlatRow =
  | { kind: 'group'; label: string }
  | { kind: 'item'; item: FeatureItem; globalIndex: number }
  | { kind: 'syncInterval' };
```

In `ScrollView`'s render, add handling for `kind === 'syncInterval'`:
```typescript
if (row.kind === 'syncInterval') {
  const syncSeconds = config.settings?.syncIntervalSeconds ?? 300;
  return (
    <SyncIntervalRow
      key="sync-interval"
      seconds={syncSeconds}
      focused={focusIndex === SYNC_INTERVAL_INDEX}
    />
  );
}
```

Also update `focusRowIndex` to find the `syncInterval` row:
```typescript
function focusRowIndex(focusIndex: number): number {
  if (focusIndex === SYNC_INTERVAL_INDEX) {
    return FLAT_ROWS.findIndex(r => r.kind === 'syncInterval');
  }
  return FLAT_ROWS.findIndex(r => r.kind === 'item' && r.globalIndex === focusIndex);
}
```

Update the hint text in `ScrollView` so it _replaces_ the default text when the sync row is focused (the `<Box marginBottom={1}>` block, around line 183–188):

```tsx
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {focusIndex === SYNC_INTERVAL_INDEX
            ? '- / + cycle · restart daemon to apply'
            : '↑/↓ navigate · Enter/Space toggle'}
        </Text>
        {hasAbove && <Text color="gray" dimColor>{'  ↑ ' + scrollTop + ' more'}</Text>}
        {hasMore  && <Text color="gray" dimColor>{'  ↓ ' + (totalRows - scrollEnd) + ' more'}</Text>}
      </Box>
```

- [ ] **Step 6: Update `ConfigPanel` props to include `configState`**

`ConfigPanel` already receives `configState: UseConfigResult` — no prop change needed. But `GroupedView` and `ScrollView` need `syncIntervalSeconds` from `config.settings`. Confirm they receive `config` (they do, as `NonNullable<UseConfigResult['config']>`).

- [ ] **Step 7: Typecheck**

```bash
cd /Users/airbo/Developer/corivo/Corivo/packages/cli
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/airbo/Developer/corivo/Corivo
git add packages/cli/src/tui/components/panels/ConfigPanel.tsx
git commit -m "feat(tui): add sync interval row to ConfigPanel with preset cycling"
```

---

## Task 5: Wire `-`/`+` keys in `App.tsx`

**Files:**
- Modify: `packages/cli/src/tui/App.tsx`

- [ ] **Step 1: Import new exports from ConfigPanel**

In `App.tsx`, update the import from `ConfigPanel`:

```typescript
import {
  ConfigPanel,
  CONFIG_ITEM_COUNT,
  FEATURE_ITEMS,
  SYNC_INTERVAL_INDEX,
  nextSyncPreset,
  prevSyncPreset,
} from './components/panels/ConfigPanel.js';
```

- [ ] **Step 2: Add `-`/`+` key handling in the config branch**

In `useInput`, inside `if (activeTab === 'config')`, add after the Space/return handler:

```typescript
      if (input === '+' || input === '=') {
        if (configFocus === SYNC_INTERVAL_INDEX) {
          const current = configState.config?.settings?.syncIntervalSeconds ?? 300;
          configState.updateSetting('syncIntervalSeconds', nextSyncPreset(current));
        }
        return;
      }
      if (input === '-') {
        if (configFocus === SYNC_INTERVAL_INDEX) {
          const current = configState.config?.settings?.syncIntervalSeconds ?? 300;
          configState.updateSetting('syncIntervalSeconds', prevSyncPreset(current));
        }
        return;
      }
```

- [ ] **Step 3: Guard `toggleFeature` to only fire for feature items**

Update the Space/return handler to add a guard:

```typescript
      if (input === ' ' || key.return) {
        if (configFocus < FEATURE_ITEMS.length) {
          const item = FEATURE_ITEMS[configFocus];
          if (item) configState.toggleFeature(item.key);
        }
        return;
      }
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/airbo/Developer/corivo/Corivo/packages/cli
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd /Users/airbo/Developer/corivo/Corivo
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 6: Build**

```bash
cd /Users/airbo/Developer/corivo/Corivo/packages/cli
npm run build
```

Expected: successful build, no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/airbo/Developer/corivo/Corivo
git add packages/cli/src/tui/App.tsx
git commit -m "feat(tui): wire -/+ keys for sync interval preset cycling in Config tab"
```

---

## Manual Verification

After all tasks complete, test end-to-end:

1. **TUI**: Run `corivo status --tui`, navigate to Config tab (key `5`), scroll to "Sync interval" row (last item in Sync group), press `+` / `-` to cycle through 5m → 15m → 30m.
2. **Config file**: Check `cat ~/.corivo/config.json` — `settings.syncIntervalSeconds` should update on each keypress.
3. **Heartbeat**: Restart daemon (`corivo restart`), check logs — sync should fire at the new interval.
4. **Manual override**: Set `"syncIntervalSeconds": 60` in `~/.corivo/config.json` by hand, restart daemon — sync fires every minute.
