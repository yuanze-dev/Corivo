# CLI Context Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `packages/cli` 内引入组合式 `CliContext` 运行时能力包，统一承载 logger、config、paths/fs、clock、output、db access 等横切能力，减少命令和 service 层反复手写 `createLogger()` / `loadConfig()` / `getConfigDir()` / `CorivoDatabase.getInstance()` 的样板代码。

**Architecture:** 新建 `src/cli/context/` 模块，提供 `CliContext` 类型、默认实现和少量受控的子能力对象。命令层和 service 层通过组合 `CliContext` 获取运行时能力，首批仅迁移 `sync`、`daemon`、`engine/auto-sync` 三处作为试点；其余命令先保持兼容，待试点稳定后再扩大范围。

**Tech Stack:** TypeScript ESM, Commander, better-sqlite3, Node.js built-ins, Vitest

**Spec:** 2026-03-31 对话确认的组合式 `CliContext` 设计（无独立 spec 文件）

---

## 文件变更地图

**新建：**
- `packages/cli/src/cli/context/types.ts` — `CliContext`、子能力接口、边界注释
- `packages/cli/src/cli/context/create-context.ts` — 默认 `CliContext` 构造函数
- `packages/cli/src/cli/context/index.ts` — context 导出入口
- `packages/cli/__tests__/unit/cli-context.test.ts` — `CliContext` 组装与能力契约测试

**修改：**
- `packages/cli/src/utils/logging.ts` — 保持 `createLogger()` 为底层工厂，补齐 `Logger` 类型导出注释，确保可作为 `CliContext.logger` 底座
- `packages/cli/src/cli/commands/sync.ts` — 从“散装 helper + 默认 logger 工厂”改为接受 `CliContext` 的试点命令
- `packages/cli/src/cli/commands/daemon.ts` — 用 `CliContext` 提供 logger、paths、fs/output
- `packages/cli/src/engine/auto-sync.ts` — 用组合方式持有 `CliContext`，移除内部重复创建 logger / 直接读取配置的散点代码
- `packages/cli/__tests__/unit/sync.test.ts` — 改为通过 mock context 验证日志和依赖调用
- `packages/cli/__tests__/unit/logging.test.ts` — 仅在需要时微调类型/导入，继续验证底层 logger 行为

**后续候选（本计划不落地，只在收尾评估是否进入下一轮）：**
- `packages/cli/src/cli/commands/start.ts`
- `packages/cli/src/cli/commands/status.ts`
- `packages/cli/src/cli/commands/list.ts`
- `packages/cli/src/tui/index.tsx`

---

## Task 1: 定义 `CliContext` 边界与类型

**Files:**
- Create: `packages/cli/src/cli/context/types.ts`
- Reference: `packages/cli/src/config.ts`
- Reference: `packages/cli/src/storage/database.ts`
- Reference: `packages/cli/src/utils/logging.ts`

- [ ] **Step 1: 写 failing test，锁定 `CliContext` 最小能力面**

在 `packages/cli/__tests__/unit/cli-context.test.ts` 里先定义最小契约：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCliContext } from '../../src/cli/context/create-context.js';

describe('createCliContext', () => {
  it('exposes logger, config, paths, fs, clock, output, and db access', async () => {
    const context = createCliContext({
      logger: {
        log: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        isDebugEnabled: () => false,
      },
    });

    expect(context.logger).toBeDefined();
    expect(context.config.load).toBeTypeOf('function');
    expect(context.config.loadSolver).toBeTypeOf('function');
    expect(context.paths.configDir).toBeTypeOf('function');
    expect(context.fs.readJson).toBeTypeOf('function');
    expect(context.clock.now).toBeTypeOf('function');
    expect(context.output.info).toBeTypeOf('function');
    expect(context.db.get).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: 定义 `CliContext` 类型文件**

在 `packages/cli/src/cli/context/types.ts` 中定义：

```ts
import type { Logger, LogTarget } from '../../utils/logging.js';
import type { CorivoConfig, SolverConfig } from '../../config.js';
import type { CorivoDatabase } from '../../storage/database.js';

export interface CliPaths {
  configDir(): string;
  databasePath(): string;
  identityPath(): string;
  solverPath(): string;
  heartbeatPidPath(): string;
}

export interface CliFs {
  exists(filePath: string): Promise<boolean>;
  readJson<T>(filePath: string): Promise<T>;
  writeJson(filePath: string, value: unknown): Promise<void>;
}

export interface CliConfigAccess {
  load(configDir?: string): Promise<CorivoConfig | null>;
  loadSolver(configDir?: string): Promise<SolverConfig | null>;
  saveSolver(config: SolverConfig, configDir?: string): Promise<void>;
  getDatabaseKey(configDir?: string): Promise<Buffer | null>;
}

export interface CliClock {
  now(): number;
}

export interface CliOutput {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export interface CliDbAccess {
  get(options?: { path?: string; key?: Buffer; enableEncryption?: boolean }): CorivoDatabase;
}

export interface CliContext {
  logger: Logger;
  config: CliConfigAccess;
  paths: CliPaths;
  fs: CliFs;
  clock: CliClock;
  output: CliOutput;
  db: CliDbAccess;
}

export interface CreateCliContextOptions {
  logger?: Logger;
  logLevel?: string;
  logTarget?: LogTarget;
}
```

约束写进文件注释：
- 只放横切运行时能力
- 不放 `syncBlocks()`、`registerDevice()` 这类业务动作
- `createLogger()` 保留在底层，不直接废弃

- [ ] **Step 3: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/cli-context.test.ts`

Expected: FAIL，提示 `create-context.ts` 或导出尚不存在

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli/context/types.ts packages/cli/__tests__/unit/cli-context.test.ts
git commit -m "test(cli): define CliContext runtime contract"
```

---

## Task 2: 实现 `CliContext` 默认构造器

**Files:**
- Create: `packages/cli/src/cli/context/create-context.ts`
- Create: `packages/cli/src/cli/context/index.ts`
- Modify: `packages/cli/src/utils/logging.ts`
- Test: `packages/cli/__tests__/unit/cli-context.test.ts`

- [ ] **Step 1: 实现 `createCliContext()`**

在 `packages/cli/src/cli/context/create-context.ts` 里组装默认能力：

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadConfig,
  loadSolverConfig,
  saveSolverConfig,
  getDatabaseKey,
} from '../../config.js';
import {
  CorivoDatabase,
  getConfigDir,
  getDefaultDatabasePath,
} from '../../storage/database.js';
import { createLogger } from '../../utils/logging.js';
import type { CliContext, CreateCliContextOptions } from './types.js';

export function createCliContext(options: CreateCliContextOptions = {}): CliContext {
  const logger = options.logger ?? createLogger(options.logTarget, options.logLevel);

  return {
    logger,
    config: {
      load: loadConfig,
      loadSolver: loadSolverConfig,
      saveSolver: saveSolverConfig,
      getDatabaseKey,
    },
    paths: {
      configDir: () => getConfigDir(),
      databasePath: () => getDefaultDatabasePath(),
      identityPath: () => path.join(getConfigDir(), 'identity.json'),
      solverPath: () => path.join(getConfigDir(), 'solver.json'),
      heartbeatPidPath: () => path.join(getConfigDir(), 'heartbeat.pid'),
    },
    fs: {
      exists: async (filePath) => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      readJson: async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf-8')),
      writeJson: async (filePath, value) => {
        await fs.writeFile(filePath, JSON.stringify(value, null, 2));
      },
    },
    clock: {
      now: () => Date.now(),
    },
    output: {
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
      success: (...args) => logger.success(...args),
    },
    db: {
      get: ({ path: dbPath, key, enableEncryption } = {}) => {
        if (!key) {
          throw new Error('CliContext.db.get requires a database key');
        }
        return CorivoDatabase.getInstance({
          path: dbPath ?? getDefaultDatabasePath(),
          key,
          enableEncryption,
        });
      },
    },
  };
}
```

- [ ] **Step 2: 导出入口**

在 `packages/cli/src/cli/context/index.ts` 中导出：

```ts
export * from './types.js';
export * from './create-context.js';
```

- [ ] **Step 3: 跑新增测试并修正实现**

Run: `cd packages/cli && npm run test -- __tests__/unit/cli-context.test.ts __tests__/unit/logging.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli/context packages/cli/src/utils/logging.ts packages/cli/__tests__/unit/cli-context.test.ts packages/cli/__tests__/unit/logging.test.ts
git commit -m "feat(cli): add composable CliContext runtime"
```

---

## Task 3: 迁移 `sync` 为 `CliContext` 试点

**Files:**
- Modify: `packages/cli/src/cli/commands/sync.ts`
- Modify: `packages/cli/__tests__/unit/sync.test.ts`
- Reference: `packages/cli/src/cli/context/types.ts`
- Reference: `packages/cli/src/cli/context/create-context.ts`

- [ ] **Step 1: 先改测试，避免继续依赖 `createSyncLogger()`**

在 `packages/cli/__tests__/unit/sync.test.ts` 中把 logger 组装改为 mock context：

```ts
const logger = {
  log: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  isDebugEnabled: () => true,
};

const context = {
  logger,
} as Pick<import('../../src/cli/context/types.js').CliContext, 'logger'>;
```

并把函数签名测试目标调整为：
- `post(..., context, label)`
- `authenticate(..., context)`
- `applyPulledChangesets(..., context.logger)` 或直接 `context`

- [ ] **Step 2: 重构 `sync.ts` 的依赖注入面**

实施规则：
- 删除 `createSyncLogger()` 这个仅一层转发的 helper
- `post()` / `authenticate()` / `applyPulledChangesets()` 不再在参数默认值里偷偷 `createLogger()`
- `createSyncCommand()` 的 action 一开始创建一次 `context`
- `loadConfig()` / `loadSolverConfig()` / `saveSolverConfig()` / `getDatabaseKey()` / `getConfigDir()` / `getDefaultDatabasePath()` / `CorivoDatabase.getInstance()` 全部改走 `context`

目标形态示例：

```ts
const context = createCliContext({ logLevel: config.settings?.logLevel });

const solverConfig = await context.config.loadSolver();
const dbKey = await context.config.getDatabaseKey();
const db = context.db.get({ key: dbKey, path: context.paths.databasePath() });
context.logger.debug('[sync:cli] starting sync');
```

- [ ] **Step 3: 运行 sync 单测**

Run: `cd packages/cli && npm run test -- __tests__/unit/sync.test.ts`

Expected: PASS

- [ ] **Step 4: 类型检查**

Run: `cd packages/cli && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/commands/sync.ts packages/cli/__tests__/unit/sync.test.ts
git commit -m "refactor(sync): consume CliContext for runtime dependencies"
```

---

## Task 4: 迁移 `daemon` 和 `auto-sync` 到组合式上下文

**Files:**
- Modify: `packages/cli/src/cli/commands/daemon.ts`
- Modify: `packages/cli/src/engine/auto-sync.ts`
- Test: `packages/cli/__tests__/unit/cli-context.test.ts`
- Test: `packages/cli/__tests__/unit/sync.test.ts`

- [ ] **Step 1: 迁移 `daemon.ts`**

把以下散点依赖改成 `CliContext`：
- `createLogger()` → `context.logger`
- `getConfigDir()` + `path.join(..., 'heartbeat.pid')` → `context.paths.heartbeatPidPath()`
- `fs.writeFile` / `fs.unlink` → 优先通过 `context.fs` 暴露的写入能力；如果 `context.fs` 暂未覆盖文本写入，则补一个受控 `writeText/remove` API，不直接继续散落 `fs`

目标形态：

```ts
const context = createCliContext();
const pidPath = context.paths.heartbeatPidPath();
context.logger.info('[corivo] Starting heartbeat background worker...');
```

- [ ] **Step 2: 迁移 `AutoSync`**

将 `AutoSync` 从：

```ts
constructor(private db: CorivoDatabase) {}
```

调整为：

```ts
constructor(
  private db: CorivoDatabase,
  private readonly context: Pick<CliContext, 'logger' | 'config' | 'clock'>
) {}
```

迁移规则：
- `loadConfig()` / `loadSolverConfig()` / `saveSolverConfig()` 改走 `context.config`
- `createLogger(console, ...)` 改为基于入口传入的 `context.logger`
- token 过期判断从 `Date.now()` 改为 `context.clock.now()`
- `catch` 内不再临时 `createLogger()`

- [ ] **Step 3: 增补或更新测试**

至少新增一个 `AutoSync` 单测，验证：
- 当 `context.clock.now()` 推进超过 TTL 时会重新取 token
- 失败分支调用的是注入 logger，而不是新建 logger

建议文件：

```ts
// packages/cli/__tests__/unit/auto-sync.test.ts
describe('AutoSync', () => {
  it('reuses injected logger and clock from CliContext', async () => {
    // fake db + fake context + fetch mock
  });
});
```

- [ ] **Step 4: 运行针对性测试**

Run: `cd packages/cli && npm run test -- __tests__/unit/cli-context.test.ts __tests__/unit/sync.test.ts __tests__/unit/auto-sync.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/commands/daemon.ts packages/cli/src/engine/auto-sync.ts packages/cli/__tests__/unit/auto-sync.test.ts packages/cli/__tests__/unit/cli-context.test.ts packages/cli/__tests__/unit/sync.test.ts
git commit -m "refactor(cli): use CliContext in daemon and auto-sync"
```

---

## Task 5: 收尾清理与迁移守则文档化

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `docs/superpowers/plans/2026-03-31-cli-context-composition.md`

- [ ] **Step 1: 在 `packages/cli/README.md` 补一段开发约定**

明确写入：
- 新的 command / service 优先组合 `CliContext`
- `CliContext` 只承载横切运行时能力
- 不要往 `CliContext` 塞业务动作
- 纯函数仍然可以继续显式接收 `logger` / `clock` 等窄依赖，不必强行全量接收整个 context

建议文案：

```md
## CLI Runtime Composition

`src/cli/context/` 提供命令层和服务层共享的运行时能力包（logger、config、paths/fs、clock、output、db）。
它的职责是减少横切依赖的样板代码，而不是承载业务动作。像同步协议、块处理、心跳规则等业务逻辑应继续放在各自模块内。
```

- [ ] **Step 2: 全量验证**

Run: `cd packages/cli && npm run test && npm run typecheck`

Expected: PASS

- [ ] **Step 3: 手动抽查试点命令**

Run:

```bash
cd packages/cli
node dist/index.js daemon run --help
node dist/index.js sync --help
```

Expected:
- 命令仍能正常打印帮助
- 没有因为 context 导入造成启动时报错

- [ ] **Step 4: 最终 commit**

```bash
git add packages/cli/README.md docs/superpowers/plans/2026-03-31-cli-context-composition.md
git commit -m "docs(cli): document CliContext composition migration"
```

---

## 风险与决策护栏

- `CliContext` 只做横切能力聚合，不做业务编排。凡是名字已经像“动作”的方法，一律不进 context。
- 第一轮只迁移 `sync`、`daemon`、`auto-sync`。不要顺手把 `start`、`status`、`list`、`query` 一起卷进来。
- 保留 `createLogger()` 作为底层工厂，避免一次性破坏所有历史调用点。
- `db.get()` 必须显式要求 `key`，不要偷偷回退去读全局配置，避免隐藏副作用。
- `output` 和 `logger` 可以共用底层实现，但语义要区分：`output` 面向用户提示，`logger` 面向调试与诊断。

## 执行备注

- 如果 Task 3 结束后发现 `CliContext` 已经明显长成 God Object，先停在 `sync` 试点，回到类型边界做收缩，不要继续推进 Task 4。
- 如果 `daemon.ts` 迁移时发现 `fs` 能力为支持文本文件写入而开始膨胀，优先只补最小 `writeText/remove`，不要做通用文件抽象框架。
- 如果 `AutoSync` 只需要 `logger/config/clock`，就只注入这三个能力的 `Pick<CliContext, ...>`，不要默认把整个 context 塞进去。
