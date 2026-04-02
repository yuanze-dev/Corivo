# Project Modularization Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Corivo` 从“命令/引擎/运行时/插件脚本交叉耦合”的现状，重构为以“状态 / 能力 / 流程”分离为核心的模块化 monorepo，优先收敛 `packages/cli`，再统一 `packages/solver` 与 `packages/plugins` 的边界。

**Architecture:** 整体重构遵循四条规则：状态进入 `state/context`，能力进入 `services/repository/runtime`，流程进入 `steps/runner/use-case`，依赖由应用装配层提供而不是业务对象内部 `new`。不再新增第二套通用框架，而是演进现有 `memory-pipeline`、`application/*`、`runtime/*`、`hosts/*` 结构，把命令层压成 adapter，把引擎层压成 orchestration，把存储/外部调用压成能力模块。

**Tech Stack:** TypeScript ESM, Commander, better-sqlite3, Fastify v5, Vitest, Node.js built-ins, shell hook scripts

**Spec:** 2026-04-03 当前对话中确认的模块化原则：状态/能力/流程分离，接收依赖优于拥有依赖，函数表达动作优于类包一切，组合优于继承

---

## 文件变更地图

**重点修改目录：**
- `packages/cli/src/cli/` — 将命令层收敛为参数解析和输出适配，不再承担业务编排
- `packages/cli/src/application/` — 变成明确的 use-case / orchestration 层
- `packages/cli/src/runtime/` — 承载查询、召回、review、渲染、索引等 runtime 能力
- `packages/cli/src/memory-pipeline/` — 明确 pipeline state、stage capability、runner observability 边界
- `packages/cli/src/raw-memory/` — 继续作为原始存储和 job queue 能力层，不承载命令逻辑
- `packages/cli/src/hosts/` — 只保留 host adapter / importer / registry 契约与实现
- `packages/cli/src/inject/` — 只保留 host 安装资产写入实现，不做 CLI 主编排
- `packages/solver/src/` — 拆成 auth / sync / db / server composition，去掉 route 与能力实现交叉
- `packages/plugins/*` — 插件脚本保持薄，只调用 CLI bridge / runtime command，不偷偷持有业务规则

**新增目录候选：**
- `packages/cli/src/application/bootstrap/` — CLI app composition root
- `packages/cli/src/application/services/` — 组合式能力提供层
- `packages/cli/src/application/memory/services/` — memory pipeline 相关的 service/repository 装配
- `packages/cli/src/application/commands/` — 若命令装配需要中转，可在此收口
- `packages/solver/src/application/` — solver use-case 层
- `packages/solver/src/runtime/` — server composition / plugin wiring

**删除/收敛目标：**
- 任何“三行转发一个现有方法”的伪 helper 文件
- 任何在命令/应用层手工 `new logger / new repo / new writer / getInstance()` 的散点代码
- 任何 CLI command 反向被 engine/import/runtime 依赖的边界反转
- 任何插件脚本直接写业务规则而不是走 CLI bridge 的逻辑

---

## 总体策略

本计划不是“一次性全仓库 rename + 搬家”，而是分 8 个可落地阶段推进。每个阶段都要求：

- 先写 failing tests 锁边界
- 只引入一种新的边界规则
- 迁移一小组高价值入口作为试点
- 在绿测后再扩大影响面
- 每阶段结束都要删除一批旧入口，而不是只新增平行新层

---

## Task 1: 建立模块化基线与依赖方向约束

**Files:**
- Create: `docs/architecture/module-boundaries-2026-04.md`
- Create: `packages/cli/__tests__/unit/module-boundaries.test.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Reference: `packages/cli/src/application/**`
- Reference: `packages/cli/src/runtime/**`
- Reference: `packages/cli/src/memory-pipeline/**`
- Reference: `packages/solver/src/**`

- [ ] **Step 1: 写一份模块边界文档**

在 `docs/architecture/module-boundaries-2026-04.md` 中明确：
- `cli/commands` 只能依赖 `application/*`、`runtime/*`、`utils/*`
- `engine/*` 不能依赖 `cli/commands/*`
- `application/*` 不能依赖 `cli/context/*`
- `memory-pipeline/*` 不依赖 `cli/*`
- `plugins/*/hooks/scripts/*.sh` 不能直接表达业务规则，只能调用 CLI 命令

- [ ] **Step 2: 写 failing test，锁定禁止反向依赖**

在 `packages/cli/__tests__/unit/module-boundaries.test.ts` 中用 `rg` 或模块扫描断言：

```ts
expect(cliCommandImports).not.toContain('../engine/');
expect(engineImports).not.toContain('../cli/commands/');
expect(memoryPipelineImports).not.toContain('../cli/');
```

- [ ] **Step 3: 运行测试，确认先失败**

Run: `cd packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`

Expected: FAIL，暴露当前反向依赖和越层导入

- [ ] **Step 4: 补齐根入口导出边界**

梳理：
- `packages/cli/src/index.ts`
- `packages/cli/src/cli/index.ts`

确保对外暴露的入口清晰，避免后续迁移时所有模块都互相直连

- [ ] **Step 5: 再跑测试并提交**

Run: `cd packages/cli && npm run test -- __tests__/unit/module-boundaries.test.ts`

```bash
git add docs/architecture/module-boundaries-2026-04.md \
  packages/cli/__tests__/unit/module-boundaries.test.ts \
  packages/cli/src/index.ts \
  packages/cli/src/cli/index.ts
git commit -m "refactor: define module boundary baseline"
```

---

## Task 2: 建立 CLI 组合根，压薄命令层

**Files:**
- Create: `packages/cli/src/application/bootstrap/create-cli-app.ts`
- Create: `packages/cli/src/application/bootstrap/types.ts`
- Modify: `packages/cli/src/cli/index.ts`
- Modify: `packages/cli/src/cli/commands/memory.ts`
- Modify: `packages/cli/src/cli/commands/host.ts`
- Modify: `packages/cli/src/cli/commands/daemon.ts`
- Modify: `packages/cli/src/cli/commands/query.ts`
- Test: `packages/cli/__tests__/integration/memory-command.test.ts`
- Test: `packages/cli/__tests__/unit/status-command.test.ts`

- [ ] **Step 1: 写 failing test，锁定“命令层只做 adapter”**

在命令测试里新增断言：
- command 构造只接收 executor / printer / logger
- command 不直接打开数据库
- command 不直接读取配置文件

- [ ] **Step 2: 新建 CLI app composition root**

在 `packages/cli/src/application/bootstrap/create-cli-app.ts` 中集中装配：
- logger
- config access
- db access
- use-case factories
- command instances

要求：
- `cli/index.ts` 只负责拿 app 并注册 commander
- command 文件只负责解析参数和调用注入进来的 use-case

- [ ] **Step 3: 迁移试点命令**

先迁移：
- `memory`
- `host`
- `daemon`
- `query`

这四个最能暴露当前问题：
- 命令里手写装配
- 命令和 engine/application 混用
- 测试依赖全局 override

- [ ] **Step 4: 运行试点测试**

Run:
- `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts`
- `cd packages/cli && npm run test -- __tests__/unit/status-command.test.ts`

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/application/bootstrap \
  packages/cli/src/cli/index.ts \
  packages/cli/src/cli/commands/memory.ts \
  packages/cli/src/cli/commands/host.ts \
  packages/cli/src/cli/commands/daemon.ts \
  packages/cli/src/cli/commands/query.ts \
  packages/cli/__tests__/integration/memory-command.test.ts \
  packages/cli/__tests__/unit/status-command.test.ts
git commit -m "refactor: introduce CLI composition root"
```

---

## Task 3: 把 `CliContext` 从“大杂烩能力包”收成窄能力接口

**Files:**
- Modify: `packages/cli/src/cli/context/types.ts`
- Modify: `packages/cli/src/cli/context/create-context.ts`
- Modify: `packages/cli/src/cli/context/configured-context.ts`
- Modify: `packages/cli/src/application/hosts/*.ts`
- Modify: `packages/cli/src/application/memory/*.ts`
- Test: `packages/cli/__tests__/unit/cli-context.test.ts`

- [ ] **Step 1: 写 failing test，锁定 context 不承载业务动作**

在 `cli-context.test.ts` 里断言：
- `CliContext` 只包含 logger / config / paths / fs / clock / output / db 这类横切能力
- 不允许出现 `runMemoryPipeline`、`installHost`、`queryRecall` 这类业务动作

- [ ] **Step 2: 重新定义 context 边界**

要求：
- `CliContext` 只做运行时能力
- `application/*` use-case 接收窄依赖，不直接吃整个 `CliContext`
- 如果某模块只需要 `logger + clock`，就只传这两个

- [ ] **Step 3: 清理当前试点污染**

重点清理：
- `packages/cli/src/application/memory/run-memory-pipeline.ts`
- `packages/cli/src/application/hosts/install-host.ts`
- `packages/cli/src/application/hosts/import-host.ts`

把“为了测试方便把一大坨能力全传进去”的写法改成按需依赖

- [ ] **Step 4: 运行测试**

Run:
- `cd packages/cli && npm run test -- __tests__/unit/cli-context.test.ts`
- `cd packages/cli && npm run test -- __tests__/integration/memory-command.test.ts`

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/cli/context \
  packages/cli/src/application/hosts \
  packages/cli/src/application/memory \
  packages/cli/__tests__/unit/cli-context.test.ts \
  packages/cli/__tests__/integration/memory-command.test.ts
git commit -m "refactor: narrow CliContext capabilities"
```

---

## Task 4: 以“状态 / 能力 / 流程”重构 memory pipeline

**Files:**
- Modify: `packages/cli/src/memory-pipeline/pipeline-state.ts`
- Modify: `packages/cli/src/memory-pipeline/types.ts`
- Modify: `packages/cli/src/memory-pipeline/runner.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/init-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/pipelines/scheduled-pipeline.ts`
- Modify: `packages/cli/src/memory-pipeline/stages/*.ts`
- Modify: `packages/cli/src/application/memory/run-memory-pipeline.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-runner.test.ts`
- Test: `packages/cli/__tests__/unit/memory-pipeline-stages.test.ts`
- Test: `packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts`

- [ ] **Step 1: 写 failing tests，锁定三分法**

新增/修改测试，明确：
- state 进入统一 pipeline state
- runner 只做阶段编排、日志、错误归一
- stage 不自己解析命令、不自己读 config 文件、不自己 `new` repo/client

- [ ] **Step 2: 明确 pipeline state**

在 `pipeline-state.ts` 中收敛每次运行的中间状态：
- claimed jobs
- collected sessions
- extracted raw memories
- merged final outputs
- memory index refresh metadata

禁止 stage 通过“隐式文件写入 + 再读目录”互相通信

- [ ] **Step 3: 明确 pipeline capability 注入**

把 stage 依赖压成几类 capability：
- source
- processor
- writer
- repository
- job completion hook

不要让 stage 直接碰应用层装配对象

- [ ] **Step 4: 给 runner 补统一可观测性**

Runner 负责：
- run id / trigger / stage count
- stage duration
- failed stage classification
- claimed job fail-safe cleanup

Stage 负责：
- 处理输入
- 产出结果

- [ ] **Step 5: 运行测试**

Run:
- `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-runner.test.ts`
- `cd packages/cli && npm run test -- __tests__/unit/memory-pipeline-stages.test.ts`
- `cd packages/cli && npm run test -- __tests__/integration/heartbeat-memory-pipeline.test.ts`

- [ ] **Step 6: 提交**

```bash
git add packages/cli/src/memory-pipeline \
  packages/cli/src/application/memory/run-memory-pipeline.ts \
  packages/cli/__tests__/unit/memory-pipeline-runner.test.ts \
  packages/cli/__tests__/unit/memory-pipeline-stages.test.ts \
  packages/cli/__tests__/integration/heartbeat-memory-pipeline.test.ts
git commit -m "refactor: separate memory pipeline state capabilities and flow"
```

---

## Task 5: 收敛 `runtime/*` 与 `engine/*`，把查询/召回/review 能力模块化

**Files:**
- Modify: `packages/cli/src/runtime/carry-over.ts`
- Modify: `packages/cli/src/runtime/query-pack.ts`
- Modify: `packages/cli/src/runtime/raw-recall.ts`
- Modify: `packages/cli/src/runtime/recall.ts`
- Modify: `packages/cli/src/runtime/review.ts`
- Modify: `packages/cli/src/runtime/retrieval.ts`
- Modify: `packages/cli/src/runtime/scoring.ts`
- Modify: `packages/cli/src/engine/query-history.ts`
- Modify: `packages/cli/src/engine/trigger-decision.ts`
- Modify: `packages/cli/src/engine/follow-up.ts`
- Test: `packages/cli/__tests__/unit/runtime-*.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 runtime 只提供能力**

把现有 runtime 测试调整为：
- runtime 模块只暴露纯能力函数 / repository 协作函数
- 不读取 commander options
- 不打印 CLI 输出

- [ ] **Step 2: 按职责分组 runtime**

建议重组为：
- retrieval
- render
- recall
- review
- scoring

每个模块内部再拆：
- types
- repository cooperation
- pure transforms

- [ ] **Step 3: 把 engine 从“业务集合”拆成 orchestration**

重点清理：
- `heartbeat.ts`
- `follow-up.ts`
- `trigger-decision.ts`

这些文件只能编排：
- 什么时机触发
- 用哪个 runtime/service
- 怎么记录结果

不能内联复杂 recall/review/render 规则

- [ ] **Step 4: 运行测试**

Run: `cd packages/cli && npm run test -- __tests__/unit/runtime-recall.test.ts __tests__/unit/runtime-review.test.ts __tests__/unit/runtime-process-state.test.ts`

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/runtime \
  packages/cli/src/engine/query-history.ts \
  packages/cli/src/engine/trigger-decision.ts \
  packages/cli/src/engine/follow-up.ts \
  packages/cli/__tests__/unit/runtime-recall.test.ts \
  packages/cli/__tests__/unit/runtime-review.test.ts \
  packages/cli/__tests__/unit/runtime-process-state.test.ts
git commit -m "refactor: modularize runtime and engine boundaries"
```

---

## Task 6: 统一 host / inject / plugin 边界，插件脚本彻底变薄

**Files:**
- Modify: `packages/cli/src/hosts/types.ts`
- Modify: `packages/cli/src/hosts/registry.ts`
- Modify: `packages/cli/src/application/hosts/*.ts`
- Modify: `packages/cli/src/inject/*.ts`
- Modify: `packages/plugins/codex/hooks/scripts/*.sh`
- Modify: `packages/plugins/claude-code/hooks/scripts/*.sh`
- Modify: `packages/plugins/cursor/hooks/scripts/*.sh`
- Modify: `packages/plugins/opencode/src/*.ts`
- Test: `packages/cli/__tests__/unit/*host*.test.ts`
- Test: `packages/cli/__tests__/integration/realtime-memory-ingest.test.ts`

- [ ] **Step 1: 写 failing tests，锁定 host/plugin 的新边界**

要求用测试锁定：
- CLI 是唯一安装与业务入口
- hook script 只做 payload 提取与 CLI 调用
- host adapter 只表达 host 差异，不做通用业务判断

- [ ] **Step 2: 抽出统一 host bridge**

在 CLI 侧提供稳定 bridge：
- realtime ingest
- carry-over
- query/recall
- review

插件脚本只负责把事件参数转换成 CLI 入参

- [ ] **Step 3: 删除脚本里的业务规则**

重点检查：
- `packages/plugins/codex/hooks/scripts/user-prompt-submit.sh`
- `packages/plugins/codex/hooks/scripts/stop.sh`
- `packages/plugins/claude-code/hooks/scripts/ingest-turn.sh`
- `packages/plugins/cursor/hooks/scripts/prompt-recall.sh`

脚本里不再决定“记什么 / 不记什么 / 怎么 review”

- [ ] **Step 4: 运行测试**

Run:
- `cd packages/cli && npm run test -- __tests__/unit/multi-host-matrix.test.ts`
- `cd packages/cli && npm run test -- __tests__/integration/realtime-memory-ingest.test.ts`

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/hosts \
  packages/cli/src/application/hosts \
  packages/cli/src/inject \
  packages/plugins/codex/hooks/scripts \
  packages/plugins/claude-code/hooks/scripts \
  packages/plugins/cursor/hooks/scripts \
  packages/plugins/opencode/src \
  packages/cli/__tests__/unit/multi-host-matrix.test.ts \
  packages/cli/__tests__/integration/realtime-memory-ingest.test.ts
git commit -m "refactor: thin host adapters and plugin scripts"
```

---

## Task 7: 按同样原则收敛 `solver` 包

**Files:**
- Create: `packages/solver/src/application/auth/*.ts`
- Create: `packages/solver/src/application/sync/*.ts`
- Create: `packages/solver/src/runtime/create-server.ts`
- Modify: `packages/solver/src/server.ts`
- Modify: `packages/solver/src/index.ts`
- Modify: `packages/solver/src/routes/auth.routes.ts`
- Modify: `packages/solver/src/routes/sync.routes.ts`
- Modify: `packages/solver/src/auth/*.ts`
- Modify: `packages/solver/src/sync/sync-handler.ts`
- Test: `packages/solver/src/**/__tests__/*` 或新增 `packages/solver/test/*`

- [ ] **Step 1: 写 failing tests，锁定 route 只做 HTTP adapter**

要求：
- route 不自己做 auth challenge 业务
- route 不直接写 SQL
- route 只解析 request / response

- [ ] **Step 2: 建立 solver application 层**

拆成：
- auth use-cases
- sync push/pull use-cases
- token lifecycle service

- [ ] **Step 3: server composition root 收口**

让：
- `server.ts`
- `index.ts`

只负责：
- load config
- build db
- build services
- register routes/plugins

- [ ] **Step 4: 运行 solver 测试**

Run:
- `cd packages/solver && npm run build`
- `cd packages/solver && npm run test`

如果当前无统一测试命令，先补一个最小集成测试入口

- [ ] **Step 5: 提交**

```bash
git add packages/solver/src/application \
  packages/solver/src/runtime/create-server.ts \
  packages/solver/src/server.ts \
  packages/solver/src/index.ts \
  packages/solver/src/routes \
  packages/solver/src/auth \
  packages/solver/src/sync
git commit -m "refactor: modularize solver application and runtime"
```

---

## Task 8: 清理伪模块化、重复 helper、过度薄封装，完成收尾

**Files:**
- Modify: `packages/cli/src/application/memory/*.ts`
- Modify: `packages/cli/src/application/bootstrap/*.ts`
- Modify: `packages/cli/src/runtime/*.ts`
- Modify: `packages/solver/src/**/*.ts`
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/solver/README.md`

- [ ] **Step 1: 写 failing test 或 lint-style check，锁定“伪 helper”**

约束：
- 纯转发 1:1 的 helper 文件必须被删掉
- 没有新增语义的 wrapper 函数不得存在
- 同一职责的 3-5 行文件不得无意义拆分

- [ ] **Step 2: 全仓库扫描并删除假模块**

重点清理：
- 纯 `return createX()` 代理
- 单函数单文件且无独立语义的 helper
- 只为“看起来模块化”而新增的 wrapper

- [ ] **Step 3: 文档同步**

更新：
- `README.md`
- `packages/cli/README.md`
- `packages/solver/README.md`

写清：
- 新的组合根
- 状态 / 能力 / 流程原则
- 命令层 / 应用层 / runtime / pipeline / plugin 的边界

- [ ] **Step 4: 运行全量验证**

Run:
- `cd packages/cli && npm run test`
- `cd packages/cli && npm run build`
- `cd packages/solver && npm run build`
- `cd packages/solver && npm run test`

- [ ] **Step 5: 提交**

```bash
git add README.md packages/cli/README.md packages/solver/README.md packages/cli/src packages/solver/src
git commit -m "refactor: complete repository modularization pass"
```

---

## 风险与约束

- 这是跨包、跨层、跨入口的大重构，必须按阶段推进，不能一口气全改完再回头找错。
- `packages/cli` 是主战场，必须先把 CLI / application / runtime / pipeline 边界收清，再动 solver 和 plugins。
- 不要在重构过程中再新造一套通用框架。优先演进现有结构，而不是复制一份“更漂亮的架构”平行共存。
- “模块化”不等于“三行一个文件”。只有当文件确实形成独立语义、独立变化点、独立测试面时才拆。
- 插件脚本必须持续保持薄；否则你会在 shell、TS runtime、CLI 三处重复维护业务规则。

---

## 里程碑验收

### Milestone A: `packages/cli` 命令层完成瘦身
- `cli/commands/*` 不再承担数据库打开、config 读取、业务 orchestration
- `engine/*` 不再 import `cli/commands/*`
- `createProgram()` / app composition root 成为唯一 CLI 装配入口

### Milestone B: memory pipeline 完成状态/能力/流程分离
- runner 只做流程和可观测性
- stage 只做单一动作
- capability 通过窄接口注入
- application entrypoint 只做装配和模式分发

### Milestone C: host/plugin 彻底变薄
- host adapter 只表达宿主差异
- inject 只表达安装资产写入
- shell hooks 不再携带业务判断

### Milestone D: solver 跟上同样边界
- routes 是 adapter
- use-case 是流程
- db/auth/sync 是能力
- server runtime 是组合根

---

## 执行建议

- 先执行 Task 1-4，只处理 `packages/cli`
- Task 5-6 视试点结果再推进
- Task 7 最后处理 `packages/solver`
- Task 8 只在前面都稳定后做，不要一开始就扫全仓库删文件

Plan complete and saved to `docs/superpowers/plans/2026-04-03-project-modularization-refactor.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
