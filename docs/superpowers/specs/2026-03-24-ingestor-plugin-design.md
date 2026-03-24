# Ingestor 插件化设计

**日期：** 2026-03-24
**状态：** 已批准
**范围：** `corivo`（主包）+ 新包 `@corivo/openclaw`

---

## 背景

`Heartbeat.start()` 目前硬编码初始化 `OpenClawIngestor`，不管用户是否安装了 OpenClaw 都会运行。OpenClaw 是可选工具，应作为独立 npm 包分发，heartbeat 按需加载。

---

## 目标

- Realtime ingestor（文件监听类）可通过 npm 包独立分发
- heartbeat 从 `config.json` 读取 ingestor 列表，动态加载
- 单个 ingestor 加载失败不影响其他 ingestor 和心跳主循环
- `corivo`（主包）只定义接口契约，不捆绑具体 ingestor 实现

---

## 架构

### 1. 接口契约（`corivo` cli 包）

新建 `packages/cli/src/ingestors/types.ts`，定义公共接口并从包入口导出：

```typescript
import type { CorivoDatabase } from '../storage/database.js';

/** 实时采集器接口 */
export interface RealtimeIngestor {
  startWatching(db: CorivoDatabase): Promise<void>;
  stop(): Promise<void>;
}

/** Ingestor 插件 manifest */
export interface IngestorPlugin {
  /** npm 包名，如 "@corivo/openclaw"（仅用于日志，不做兼容检查） */
  name: string;
  create(): RealtimeIngestor;
}
```

> `version` 字段从接口中去掉——当前不做版本兼容检查，避免空字段引起歧义。

第三方 ingestor 包将 `corivo` 列为 `peerDependencies`，只引用类型，不捆绑实现。

---

### 2. Config schema

`CorivoConfig`（`packages/cli/src/config.ts`）新增字段：

```typescript
/** 已启用的 ingestor npm 包名列表 */
ingestors?: string[];
```

`~/.corivo/config.json` 实际示例（`ingestors` 与现有必填字段并存）：

```json
{
  "version": "1",
  "identity_id": "...",
  "db_key": "...",
  "created_at": "...",
  "ingestors": ["@corivo/openclaw"]
}
```

字段缺失或为空数组时，heartbeat 不加载任何 ingestor（向后兼容）。

---

### 3. Ingestor 包的安装位置与模块解析

heartbeat 作为 launchd daemon 运行，`import(packageName)` 的解析起点是编译后的 `dist/` 目录。因此 ingestor 包必须安装到 heartbeat 能找到的位置。

**约定：ingestor 包安装到全局（`npm install -g`）**

```bash
npm install -g @corivo/openclaw
```

全局包在 Node.js 模块解析链中可被动态 `import()` 找到。

`corivo ingestor add` CLI 命令（未来迭代）将封装此安装步骤，用户无需手动操作。

---

### 4. Heartbeat 加载器

`Heartbeat.start()` 中替换硬编码的 `OpenClawIngestor` 初始化：

**删除：**
- `private openclawIngestor: OpenClawIngestor | null`
- `new OpenClawIngestor()` + `startWatching()`
- `stop()` 里的 openclaw 清理

**新增：**
- `private ingestors: RealtimeIngestor[] = []`

**加载逻辑（在读取 config 之后执行）：**

```typescript
for (const packageName of corivoConfig?.ingestors ?? []) {
  try {
    const mod = await import(packageName);
    const plugin: IngestorPlugin = mod.default ?? mod;
    const ingestor = plugin.create();
    await ingestor.startWatching(this.db);
    this.ingestors.push(ingestor);
    console.log(`[Heartbeat] 已加载 ingestor: ${plugin.name}`);
  } catch (err) {
    console.error(`[Heartbeat] 加载 ${packageName} 失败，跳过:`, err);
  }
}
```

**stop() 清理：**

```typescript
for (const ingestor of this.ingestors) {
  await ingestor.stop();
}
this.ingestors = [];
```

---

### 5. `@corivo/openclaw` 插件包

新建 `packages/plugins/openclaw/`，与现有 `claude-code`、`codex` 插件平级。

**目录结构：**

```
packages/plugins/openclaw/
  package.json
  tsconfig.json
  src/
    index.ts      ← default export: IngestorPlugin manifest
    ingestor.ts   ← 迁移自 packages/cli/src/ingestors/openclaw-ingestor.ts
```

**`src/index.ts`：**

```typescript
import { OpenClawIngestor } from './ingestor.js';
import type { IngestorPlugin } from 'corivo';

const plugin: IngestorPlugin = {
  name: '@corivo/openclaw',
  create: () => new OpenClawIngestor(),
};

export default plugin;
```

**`package.json` 关键字段：**

```json
{
  "name": "@corivo/openclaw",
  "type": "module",
  "main": "dist/index.js",
  "peerDependencies": {
    "corivo": "*"
  }
}
```

---

## 迁移计划

| 操作 | 文件 |
|------|------|
| 新建 | `packages/cli/src/ingestors/types.ts` |
| 新建 | `packages/cli/src/ingestors/index.ts`（导出 types） |
| 修改 | `packages/cli/src/config.ts`（加 `ingestors` 字段） |
| 修改 | `packages/cli/src/engine/heartbeat.ts`（替换硬编码） |
| 新建 | `packages/plugins/openclaw/`（整个目录） |
| 移动 | `openclaw-ingestor.ts` → `packages/plugins/openclaw/src/ingestor.ts` |
| 删除 | `packages/cli/src/ingestors/openclaw-ingestor.ts` |

**cold-scan 的 `extractors/openclaw.ts` 不动**——它是一次性扫描，不属于 realtime ingestor。

---

## 错误处理

- `import(packageName)` 失败（包未安装/找不到）→ `console.error` + 跳过，继续加载其他 ingestor
- `startWatching()` 抛出异常 → 同上，单个失败不阻塞 heartbeat
- `default` export 不符合 `IngestorPlugin` 接口 → 运行时报错被 catch，跳过

---

## 不在此次范围内

- `corivo ingestor install/list/remove` CLI 命令（封装 npm install -g，后续迭代）
- daemon 运行时热重载（修改 `config.json` 后需 `corivo restart` 生效）
- ingestor 版本兼容检查
- `runFirstRun()` 支持 ingestor 加载
