# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概述

Corivo 是一个融入用户已有工作流的赛博**伙伴**。它不是一个独立的 App，而是寄生在 Codex、Cursor、飞书等工具中的后台服务——自动从用户的 AI 对话和消息中采集信息，持续整理和更新，在合适的时机以 `[corivo]` 的名义主动提醒用户。

当前版本请以各 package 的 `package.json` 为准（workspace 内版本独立演进）

详细设计文档见 [README.md](./README.md)

---

## Package 文档

相关 package 的本地开发说明分散在各自文档中：

- [`packages/cli/CLAUDE.md`](./packages/cli/CLAUDE.md) — CLI 工具、数据库、心跳引擎
- [`packages/solver/CLAUDE.md`](./packages/solver/CLAUDE.md) — CRDT 同步服务器
- [`packages/plugins/codex/AGENTS.md`](./packages/plugins/codex/AGENTS.md) — Codex 插件

**进入某个 package 工作时，优先阅读该 package 的本地说明文档。**

---

## 构建与测试（快速参考）

每个 package 独立管理，进入对应目录后操作：

```bash
# packages/cli
cd packages/cli
npm run build          # tsup
npm run dev            # tsup --watch
npm run test           # vitest --run

# packages/solver
cd packages/solver
npm run dev            # tsx watch src/index.ts（开发热重载）
npm run build          # tsc
npm run start          # node dist/index.js

# packages/plugins/codex
cd packages/plugins/codex
# 配置/文档型 package，无独立构建步骤
```

**测试**（当前以 cli package 的 Vitest 套件最完整）：

```bash
cd packages/cli
# 运行所有测试
npm run test

# 运行单个测试文件
npm run test -- __tests__/unit/database.test.ts
npm run test -- __tests__/integration/heartbeat.test.ts
npm run test -- __tests__/integration/claude-code-ingestor.test.ts
```

> 注意：`@corivo/cli` 是纯 ESM 模块。`better-sqlite3` 是 CJS，通过 `createRequire(import.meta.url)` 加载。

---

## 包架构

### packages/cli（`@corivo/cli`）

核心 CLI 工具，包含所有本地存储和智能处理逻辑。

**数据流：**

```
用户工具（Codex / Cursor）
    │
    ▼
Ingestors / Cold Scan      ← 采集原始信息
    │
    ▼
CorivoDatabase             ← better-sqlite3，存储于 ~/.corivo/corivo.db
    │ (Blocks + Associations + Query Logs)
    ▼
Heartbeat Engine（每 5 秒）
    ├── processPendingBlocks → RuleEngine 标注（决策/事实/知识）
    ├── processVitalityDecay → 按标注类型衰减（决策最慢，知识最快）
    ├── processAssociations → 发现 Block 间关联（每 30s）
    └── processConsolidation → 去重 + 摘要 + 补链（每 1min）
    │
    ▼
CLI Commands（save / query / status / push / inject …）
```

**核心模型：**

- `Block`：记忆单元。字段：`id / content / annotation / vitality / status / refs / pattern / source`
- `vitality`：0–100 的生命力，驱动 `status`（active → cooling → cold → archived）
- `annotation`：三段式 `"类型 · 子类 · 标签"`，例如 `"决策 · project · typescript"`
- `Association`：Block 间有向关系，类型：similar / related / conflicts / refines / supersedes / causes / depends_on

**数据库特点：**

- 数据目录：`~/.corivo/`，主库：`corivo.db`
- WAL 模式，FTS5 全文搜索（中文降级为 LIKE 搜索）
- 可选 SQLCipher 加密，不可用时自动降级为应用层加密（`KeyManager`）
- `CorivoDatabase.getInstance()` 单例，进程生命周期内不关闭

**目录结构：**

```
src/
  cli/commands/     CLI 命令实现（commander）
  cold-scan/        一次性扫描提取器（Codex, cursor, git, package.json…）
  engine/           核心引擎
    heartbeat.ts    后台守护进程主循环
    rules/          规则引擎（当前只有 tech-choice 规则）
    associations.ts 关联发现
    consolidation.ts 去重与整合
  ingestors/        实时摄取器（当前只有 Codex）
  identity/         身份标识（平台指纹，无需密码）
  crypto/           密钥管理与内容加密
  storage/          数据库封装
  models/           Block / Association / Pattern 类型定义
  push/             上下文推送（注入到 AI 工具）
  inject/           Codex Rules 注入
```

**守护进程运行方式：**

`corivo start` 通过 macOS launchd（`packages/cli/src/daemon/macos.ts`）将心跳进程注册为后台服务。密钥通过环境变量 `CORIVO_DB_KEY`（base64）传入心跳进程。

---

### packages/solver（`@corivo/solver`）

CRDT 同步中继服务器，供多设备同步使用。基于 Fastify v5。

**认证流程（Challenge-Response + Bearer Token）：**

```
Client → POST /auth/challenge → { challenge }
Client → POST /auth/verify   → { identityId, signature } → { token }
Client → 后续请求带 Authorization: Bearer <token>
```

Token 存储在内存 Map 中，TTL 由 `config.tokenTtlMs` 控制，后台每 5 分钟清理过期 token。

**同步端点：**

- `POST /sync/push` — 客户端推送 changeset rows（幂等，`INSERT OR IGNORE`）
- `POST /sync/pull` — 客户端拉取指定 `since_version` 之后的 changesets

Changeset 存储于服务端 SQLite（`src/db/server-db.ts`），每条记录按 `identity_id` 隔离。

---

### packages/plugins/codex（`@corivo/codex`）

Codex 插件包，让 AI 工具能读写 Corivo 记忆。

**组成：**

- `src/api.ts`：`CorivoAPI` 类，通过 `execSync('corivo ...')` 调用本地 CLI
- `skills/corivo-save/skill.md`：教 Codex 如何保存记忆
- `skills/corivo-query/skill.md`：教 Codex 如何查询记忆
- `hooks/hooks.json`：Codex hook 配置（session-init 等）
- `.Codex-plugin/`：插件元数据与市场信息

---

## 开发规范

### Git 分支

- ❌ 不在 main 直接修改
- ✅ 所有改动在子分支完成，完成后合并
- 分支命名：`feature/功能名称` / `fix/问题描述` / `refactor/模块名称`

### Commit 规范

```
<类型>: <描述>

原因：<为什么>
```

类型：feat / fix / refactor / docs / hotfix

### 原子化提交

每个 commit 只做一件事，保持最小可理解单元：

- ✅ 一个功能点、一个 bug fix、一次重构对应一个 commit
- ❌ 不在同一个 commit 里混合功能实现与格式整理
- ❌ 不把"顺手改的东西"塞进不相关的 commit

**判断标准：** commit message 能用一句话清晰描述，且 diff 只包含该描述涉及的改动。

**拆分时机：**
- 实现某功能前，先把前置重构单独提交
- bug fix 和触发该 bug 的测试分两个 commit（测试先提交）
- 同一文件的多处无关改动，分多次 `git add -p` 暂存后分别提交

---

## Design System

**做任何 UI / 视觉决策前，必须先读 DESIGN.md。**

- Aesthetic: Organic/Natural — 「记忆像植物一样生长」
- Colors: 暖灰基底 + 琥珀强调色（`#d97706`）
- Typography: Instrument Serif（Display）+ Instrument Sans（Body）
- Spacing: 8px base unit, Comfortable density

---

最后更新：2026-03-20
