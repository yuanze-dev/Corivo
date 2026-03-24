# Ingestor 插件化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenClaw realtime ingestor 从 `corivo` 主包剥离，定义可插拔接口，发布为独立包 `@corivo/openclaw`，heartbeat 从 `config.json` 动态加载。

**Architecture:** 在 `corivo` 主包定义 `RealtimeIngestor` / `IngestorPlugin` 接口并对外导出；heartbeat 启动时遍历 `config.ingestors` 列表，动态 `import()` 每个包并调用 `plugin.create()`；`@corivo/openclaw` 作为独立包放在 `packages/plugins/openclaw/`，实现接口，包含迁移后的 `OpenClawIngestor`。

**Tech Stack:** TypeScript ESM, Node ≥ 18, pnpm workspace, vitest（测试：`pnpm test` from repo root）

---

## 文件变更总览

| 操作 | 路径 | 说明 |
|------|------|------|
| 新建 | `packages/cli/src/ingestors/types.ts` | 接口定义 |
| 新建 | `packages/cli/src/ingestors/index.ts` | barrel export |
| 修改 | `packages/cli/src/index.ts` | 导出 ingestors types |
| 修改 | `packages/cli/tsup.config.ts` | 移除 openclaw-ingestor 构建入口 |
| 修改 | `packages/cli/src/config.ts` | 加 `ingestors` 字段 |
| 修改 | `packages/cli/src/engine/heartbeat.ts` | 替换硬编码 ingestor，新增 `loadIngestors()` 公开方法 |
| 新建 | `packages/plugins/openclaw/package.json` | 插件包配置 |
| 新建 | `packages/plugins/openclaw/tsconfig.json` | TS 配置（NodeNext） |
| 新建 | `packages/plugins/openclaw/src/index.ts` | plugin manifest |
| 移动 | `openclaw-ingestor.ts` → `packages/plugins/openclaw/src/ingestor.ts` | 原样迁移 |
| 删除 | `packages/cli/src/ingestors/openclaw-ingestor.ts` | 迁移后删除 |

---

## Task 1: 定义插件接口（`corivo` 主包）

**Files:**
- Create: `packages/cli/src/ingestors/types.ts`
- Create: `packages/cli/src/ingestors/index.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/__tests__/unit/ingestor-types.test.ts`

- [ ] **Step 1: 写失败测试**

  `packages/cli/__tests__/unit/ingestor-types.test.ts`:

  ```typescript
  import { describe, it, expectTypeOf } from 'vitest';
  import type { RealtimeIngestor, IngestorPlugin } from '../../src/ingestors/types';

  describe('IngestorPlugin interface', () => {
    it('RealtimeIngestor has required methods', () => {
      type T = RealtimeIngestor;
      expectTypeOf<T['startWatching']>().toBeFunction();
      expectTypeOf<T['stop']>().toBeFunction();
    });

    it('IngestorPlugin has name and create', () => {
      type T = IngestorPlugin;
      expectTypeOf<T['name']>().toBeString();
      expectTypeOf<T['create']>().toBeFunction();
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  pnpm test ingestor-types
  ```
  Expected: 导入报错（文件不存在）

- [ ] **Step 3: 创建 `packages/cli/src/ingestors/types.ts`**

  ```typescript
  /**
   * Ingestor 插件接口契约
   *
   * 实现此接口的 npm 包可通过 config.json 的 ingestors 字段注册到 heartbeat。
   */
  import type { CorivoDatabase } from '../storage/database.js';

  /** 实时采集器接口 */
  export interface RealtimeIngestor {
    startWatching(db: CorivoDatabase): Promise<void>;
    stop(): Promise<void>;
  }

  /**
   * Ingestor 插件 manifest
   *
   * 每个 ingestor 包的 default export 必须符合此接口。
   * name 仅用于日志，不做版本兼容检查。
   */
  export interface IngestorPlugin {
    name: string;
    create(): RealtimeIngestor;
  }
  ```

- [ ] **Step 4: 创建 `packages/cli/src/ingestors/index.ts`**

  ```typescript
  export type { RealtimeIngestor, IngestorPlugin } from './types.js';
  ```

- [ ] **Step 5: 在 `packages/cli/src/index.ts` 末尾追加导出**

  在文件末尾加一行：

  ```typescript
  export type { RealtimeIngestor, IngestorPlugin } from './ingestors/index.js';
  ```

- [ ] **Step 6: 运行测试确认通过**

  ```bash
  pnpm test ingestor-types
  ```
  Expected: PASS

- [ ] **Step 7: typecheck**

  ```bash
  cd packages/cli && npm run typecheck
  ```
  Expected: 无错误

- [ ] **Step 8: commit**

  ```bash
  git add packages/cli/src/ingestors/types.ts packages/cli/src/ingestors/index.ts packages/cli/src/index.ts packages/cli/__tests__/unit/ingestor-types.test.ts
  git commit -m "feat(cli): 定义 RealtimeIngestor / IngestorPlugin 接口"
  ```

---

## Task 2: 为 `CorivoConfig` 添加 `ingestors` 字段

**Files:**
- Modify: `packages/cli/src/config.ts`
- Test: `packages/cli/__tests__/unit/config-settings.test.ts` (追加用例)

- [ ] **Step 1: 写失败测试**

  在 `packages/cli/__tests__/unit/config-settings.test.ts` 末尾追加：

  ```typescript
  it('accepts ingestors array in config', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
      ingestors: ['@corivo/openclaw'],
    };
    expect(config.ingestors).toEqual(['@corivo/openclaw']);
  });

  it('treats missing ingestors as undefined', () => {
    const config: CorivoConfig = {
      version: '1',
      created_at: '2026-01-01',
      identity_id: 'test-id',
      db_key: 'dGVzdA==',
    };
    expect(config.ingestors).toBeUndefined();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  pnpm test config-settings
  ```
  Expected: TS 编译错误，`ingestors` 不在 `CorivoConfig`

- [ ] **Step 3: 修改 `packages/cli/src/config.ts`**

  在 `CorivoConfig` interface 的 `settings?: CorivoSettings;` 后追加：

  ```typescript
  /** 已启用的 ingestor npm 包名列表（需全局安装：npm install -g <pkg>） */
  ingestors?: string[];
  ```

- [ ] **Step 4: 运行测试确认通过**

  ```bash
  pnpm test config-settings
  ```
  Expected: PASS（含新增 2 个用例）

- [ ] **Step 5: commit**

  ```bash
  git add packages/cli/src/config.ts packages/cli/__tests__/unit/config-settings.test.ts
  git commit -m "feat(cli): CorivoConfig 添加 ingestors 字段"
  ```

---

## Task 3: Heartbeat 替换为插件加载器

**Files:**
- Modify: `packages/cli/src/engine/heartbeat.ts`
- Test: `packages/cli/__tests__/integration/heartbeat.test.ts` (追加用例)

> `loadIngestors` 改为 `public` 以便测试直接调用，不通过 `start()` 的 daemon 路径。

- [ ] **Step 1: 写失败测试**

  在 `packages/cli/__tests__/integration/heartbeat.test.ts` 里追加一个 describe 块：

  ```typescript
  describe('Heartbeat.loadIngestors', () => {
    it('does nothing when package list is empty', async () => {
      const heartbeat = new Heartbeat({ db });
      await expect(heartbeat.loadIngestors([])).resolves.not.toThrow();
    });

    it('swallows failed dynamic import and does not throw', async () => {
      const heartbeat = new Heartbeat({ db });
      // 'nonexistent-pkg-xyz' 不会存在，import() 会抛出
      await expect(
        heartbeat.loadIngestors(['nonexistent-pkg-xyz'])
      ).resolves.not.toThrow();
    });

    it('calls startWatching on a valid plugin', async () => {
      const heartbeat = new Heartbeat({ db });

      let watchingCalled = false;
      const mockPlugin = {
        name: 'mock-ingestor',
        create: () => ({
          startWatching: async (_db: unknown) => { watchingCalled = true; },
          stop: async () => {},
        }),
      };

      // 通过 vi.mock 或直接注入：这里我们用 loadIngestors 暴露的测试接口
      // 由于 dynamic import 无法直接 mock，改为在 heartbeat 上暴露 loadPlugin 方法
      // 见 Step 6 的实现说明
      await heartbeat.loadPlugin(mockPlugin);
      expect(watchingCalled).toBe(true);
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  pnpm test heartbeat
  ```
  Expected: 失败（`loadIngestors` 和 `loadPlugin` 方法不存在）

- [ ] **Step 3: 修改 `heartbeat.ts` — 替换 openclawIngestor 字段**

  找到并删除：
  ```typescript
  private openclawIngestor: OpenClawIngestor | null = null;
  ```
  替换为：
  ```typescript
  private ingestors: RealtimeIngestor[] = [];
  ```

- [ ] **Step 4: 修改 `heartbeat.ts` — 删除 OpenClawIngestor import，添加类型 import**

  删除：
  ```typescript
  import { OpenClawIngestor } from '../ingestors/openclaw-ingestor.js';
  ```
  添加（在其他 import 旁）：
  ```typescript
  import type { RealtimeIngestor, IngestorPlugin } from '../ingestors/types.js';
  ```

- [ ] **Step 5: 修改 `heartbeat.ts` — 替换 start() 中的 ingestor 初始化**

  删除这两行：
  ```typescript
  // 初始化 OpenClaw 采集器（事件驱动模式）
  this.openclawIngestor = new OpenClawIngestor();
  await this.openclawIngestor.startWatching(this.db);
  ```
  替换为：
  ```typescript
  // 动态加载插件 ingestors
  await this.loadIngestors(corivoConfig?.ingestors ?? []);
  ```

- [ ] **Step 6: 修改 `heartbeat.ts` — 添加 loadIngestors / loadPlugin 公开方法**

  在 `stop()` 方法之前插入：

  ```typescript
  /**
   * 动态加载 ingestor 插件列表
   *
   * 依次 import 每个包名，失败则跳过，不中断其他 ingestor 和心跳主循环。
   * 插件包需全局安装：npm install -g <package-name>
   *
   * Public for testing.
   */
  async loadIngestors(packageNames: string[]): Promise<void> {
    for (const packageName of packageNames) {
      try {
        const mod = await import(packageName);
        const plugin = (mod.default ?? mod) as IngestorPlugin;
        await this.loadPlugin(plugin);
      } catch (err) {
        console.error(`[Heartbeat] 加载 ${packageName} 失败，跳过:`, err);
      }
    }
  }

  /**
   * 初始化并注册单个 ingestor 插件
   *
   * Public for testing.
   */
  async loadPlugin(plugin: IngestorPlugin): Promise<void> {
    const ingestor = plugin.create();
    await ingestor.startWatching(this.db!);
    this.ingestors.push(ingestor);
    console.log(`[Heartbeat] 已加载 ingestor: ${plugin.name}`);
  }
  ```

- [ ] **Step 7: 修改 `heartbeat.ts` — 更新 stop() 清理逻辑**

  删除：
  ```typescript
  // 停止 OpenClaw 采集器
  if (this.openclawIngestor) {
    await this.openclawIngestor.stop();
    this.openclawIngestor = null;
  }
  ```
  替换为：
  ```typescript
  // 停止所有 ingestor 插件
  for (const ingestor of this.ingestors) {
    await ingestor.stop();
  }
  this.ingestors = [];
  ```

- [ ] **Step 8: 运行测试确认通过**

  ```bash
  pnpm test heartbeat
  ```
  Expected: PASS（含新增 3 个用例）

- [ ] **Step 9: typecheck**

  ```bash
  cd packages/cli && npm run typecheck
  ```
  Expected: 无错误

- [ ] **Step 10: commit**

  ```bash
  git add packages/cli/src/engine/heartbeat.ts packages/cli/__tests__/integration/heartbeat.test.ts
  git commit -m "feat(heartbeat): 替换硬编码 OpenClaw，改为插件加载器"
  ```

---

## Task 4: 创建 `@corivo/openclaw` 插件包

**Files:**
- Create: `packages/plugins/openclaw/package.json`
- Create: `packages/plugins/openclaw/tsconfig.json`
- Create: `packages/plugins/openclaw/src/ingestor.ts`
- Create: `packages/plugins/openclaw/src/index.ts`

- [ ] **Step 1: 创建 `packages/plugins/openclaw/package.json`**

  ```json
  {
    "name": "@corivo/openclaw",
    "version": "0.1.0",
    "description": "Corivo OpenClaw 实时采集器插件",
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "files": [
      "dist"
    ],
    "scripts": {
      "build": "tsc",
      "typecheck": "tsc --noEmit"
    },
    "keywords": ["corivo", "ingestor", "openclaw"],
    "author": "Corivo Team",
    "license": "MIT",
    "peerDependencies": {
      "corivo": "*"
    },
    "devDependencies": {
      "corivo": "workspace:*",
      "@types/node": "^20.19.37",
      "typescript": "^5.5.4"
    },
    "engines": {
      "node": ">=18.0.0"
    }
  }
  ```

  > `corivo: "workspace:*"` 在 devDependencies 里让 pnpm 在构建时链接 workspace 内的 `corivo` 包，使 `import type { ... } from 'corivo'` 能解析。

- [ ] **Step 2: 创建 `packages/plugins/openclaw/tsconfig.json`**

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "lib": ["ES2022"],
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "outDir": "./dist",
      "rootDir": "./src"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }
  ```

  > `NodeNext` 模式要求相对导入带 `.js` 后缀（源码里已经是 `.js`），正确适配 plain tsc + ESM。

- [ ] **Step 3: 将 `openclaw-ingestor.ts` 内容复制到 `packages/plugins/openclaw/src/ingestor.ts`**

  复制 `packages/cli/src/ingestors/openclaw-ingestor.ts` 的全部内容，修改唯一一处 import：

  ```typescript
  // 原：
  import type { CorivoDatabase } from '../storage/database.js';
  // 改为：
  import type { CorivoDatabase } from 'corivo';
  ```

- [ ] **Step 4: 创建 `packages/plugins/openclaw/src/index.ts`**

  ```typescript
  /**
   * @corivo/openclaw
   *
   * OpenClaw realtime ingestor 插件。
   * 安装：npm install -g @corivo/openclaw
   * 启用：在 ~/.corivo/config.json 的 ingestors 数组中添加 "@corivo/openclaw"
   */
  import { OpenClawIngestor } from './ingestor.js';
  import type { IngestorPlugin } from 'corivo';

  const plugin: IngestorPlugin = {
    name: '@corivo/openclaw',
    create: () => new OpenClawIngestor(),
  };

  export default plugin;
  ```

- [ ] **Step 5: 安装依赖并构建**

  从 repo 根目录运行（让 pnpm 解析 workspace 依赖）：

  ```bash
  pnpm install
  pnpm --filter @corivo/openclaw run build
  ```
  Expected: `packages/plugins/openclaw/dist/` 目录生成，无 TS 错误

- [ ] **Step 6: commit**

  ```bash
  git add packages/plugins/openclaw/
  git commit -m "feat(openclaw): 新建 @corivo/openclaw 插件包"
  ```

---

## Task 5: 清理 cli 包

**Files:**
- Delete: `packages/cli/src/ingestors/openclaw-ingestor.ts`
- Modify: `packages/cli/tsup.config.ts`

- [ ] **Step 1: 从 `tsup.config.ts` 中删除 openclaw-ingestor 构建入口**

  找到并删除这两行（不需要替换，接口类型通过 `src/index.ts` 的 export 已覆盖）：
  ```typescript
  // Ingestors
  'ingestors/openclaw-ingestor': 'src/ingestors/openclaw-ingestor.ts',
  ```

- [ ] **Step 2: 删除 `packages/cli/src/ingestors/openclaw-ingestor.ts`**

  ```bash
  git rm packages/cli/src/ingestors/openclaw-ingestor.ts
  ```
  `git rm` 会自动 stage 删除。

- [ ] **Step 3: 构建 cli 包确认无残留引用**

  ```bash
  cd packages/cli && npm run build
  ```
  Expected: 构建成功，无报错

- [ ] **Step 4: 运行全量测试**

  ```bash
  cd .. && pnpm test
  ```
  Expected: 全部 PASS

- [ ] **Step 5: commit**

  ```bash
  # git rm 已在 Step 2 stage 了删除，这里只需补上 tsup 改动
  git add packages/cli/tsup.config.ts
  git commit -m "chore(cli): 移除 openclaw-ingestor，完成插件化迁移"
  ```

---

## 验证检查清单

在认为工作完成之前，确认以下所有项：

- [ ] `pnpm test` 全部通过
- [ ] `cd packages/cli && npm run typecheck` 无错误
- [ ] `pnpm --filter @corivo/openclaw run build` 无错误
- [ ] `packages/cli/src/ingestors/openclaw-ingestor.ts` 已不存在
- [ ] `packages/cli/src/ingestors/types.ts` 存在并导出 `RealtimeIngestor` 和 `IngestorPlugin`
- [ ] `packages/plugins/openclaw/dist/` 目录存在
- [ ] `packages/cli/src/engine/heartbeat.ts` 中不再有 `OpenClawIngestor` 字样
