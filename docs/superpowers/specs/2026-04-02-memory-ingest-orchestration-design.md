# Corivo Memory Ingest And Orchestration Design

**日期**: 2026-04-02
**状态**: 提议中
**范围**: `packages/cli`，影响 `packages/plugins/hosts/claude-code` 与 `packages/plugins/hosts/codex`

---

## 目标

补上 Corivo memory 闭环里尚未正式定义的“上游编排层”：

- 历史 session 如何进入系统
- 实时 prompt 原文如何进入系统
- hooks 如何只做轻量入库与任务唤起，而不阻塞宿主
- 04-02 extraction / merge 机制如何被正式挂到可恢复、可重试、可增量的运行链路里

本设计要解决的是：

- `corivo host import <host>` 的正式命令面
- `claude-code` 与 `codex` 的历史导入入口
- raw session / raw message / processing job 的正式分层
- `UserPromptSubmit` 与 `Stop` 的实时原文写入职责
- DB-backed queue 的最小设计
- memory pipeline runner 如何消费这些 job
- install 流程如何保留“可选自动导入历史”的产品入口

本设计不解决：

- Phase 1 / Phase 2 prompt 细节
- final Markdown memory 的具体 merge 语义
- recall 排序算法细节
- 更多宿主的接入方式
- SaaS 队列或远程 job worker

## 与现有文档的关系

### 与 `2026-04-02-memory-extraction-and-merge-design.md` 的关系

该文档定义的是：

- 给定 session 后，如何做 raw extraction
- raw memory 如何 merge 成 final memory

它明确不定义：

- 何时触发
- 谁挑 session
- 如何重试
- 如何调度

本文件补的正是这部分“上游编排层”。

### 与 `2026-04-01-memory-pipeline-framework-design.md` 的关系

framework design 定义 pipeline / stage / artifact / runner 的骨架。

本文件进一步落定：

- pipeline 的输入从哪里来
- 实时与历史两类入口如何统一
- 如何通过 job queue 把 hooks 与 runner 解耦
- runner 在什么粒度上消费 session

### 与 `Docs/rfc/v0.11/corivo-memory-recall-milestone.md` 的关系

milestone 要求：

```text
历史或实时消息原文进入 DB
  -> 异步生成 / 追加 Markdown memory
  -> 宿主 prompt hooks 注入 Corivo skill + memory index
  -> Agent 通过 skill / CLI 查询摘要或原文
```

本文件负责把其中前两段正式定义清楚：

- 原文进入 DB
- 异步进入 memory 处理链

## 核心设计结论

### 1. 历史导入统一入口为 `corivo host import <host>`

不采用 `corivo host <host> import-session`。

正式入口：

```bash
corivo host import claude-code --all
corivo host import codex --all
corivo host import claude-code --since <cursor>
corivo host import codex --since <cursor>
```

设计原则：

- `corivo host ...` 是所有宿主管理行为的主入口
- `import` 与 `install / doctor / uninstall` 同级
- 命令层只做参数解析与输出
- 历史 session 的读取由 host adapter 提供

### 2. 默认不隐式全量导入

第一版规则固定为：

- CLI 直接执行 `corivo host import <host>` 时，默认行为是 `--since last-import`
- 如果该 host 尚无 last-import cursor，则命令报错并提示用户显式使用 `--all`
- install 流程中的“自动导入历史”由 install use case 显式触发 `--all`

这样做的目的：

- 避免用户无意中启动重型全量导入
- 把“首次全量导入”保留为明确决策
- 让 install 流程仍然保留“推荐自动导入”的产品体验

### 3. 原文层与 memory 层强分离

不把原文 session / message 直接写进现有 `blocks`。

分层固定为：

- raw layer：session / message / processing jobs / processing state
- memory layer：Phase 1 / Phase 2 产出的 raw memory markdown 与 final markdown
- block layer：现有 Corivo block 语义层，继续承载查询、关联、已有规则引擎等能力

原因：

- raw layer 是 source of truth
- memory layer 是加工产物
- block layer 是 Corivo 已有的长期语义层

这三者职责不同，不应混到一张表里。

### 4. hooks 只做“快速入库 + 唤起 job”

不在 hooks 里执行模型提取或 Markdown 写入。

实时链路职责固定为：

- `UserPromptSubmit`
  - 写入 user message 到 raw DB
  - 确保该 session 存在待处理 job
  - 立即返回
- `Stop`
  - 写入 assistant message 到 raw DB
  - 刷新或补充该 session 的待处理 job
  - 立即返回

Phase 1 / Phase 2、raw markdown、final markdown 都由后台 runner 异步完成。

### 5. 使用 DB-backed queue，不使用观察者模式

第一版采用持久化 job 表：

- 不依赖同进程 observer callback
- 不要求独立消息队列服务
- 允许失败重试、幂等去重、跨进程恢复

这是一个队列驱动的 orchestration 模型，不是观察者模式。

## 用户闭环

### 闭环 A：install 时的可选自动导入

```text
corivo host install claude-code
  -> 写入宿主资产
  -> installer 询问是否导入近期历史
  -> 若用户同意，内部显式调用 `corivo host import claude-code --all`
  -> 历史 session 入 raw DB
  -> 创建 processing jobs
  -> runner 异步处理
  -> 生成 Markdown memory
```

### 闭环 B：手动导入历史

```text
corivo host import claude-code --all
  -> host importer 读取历史 session
  -> session / message upsert 到 raw DB
  -> enqueue jobs
  -> runner 异步处理
```

### 闭环 C：实时使用

```text
UserPromptSubmit
  -> upsert user message
  -> ensure extract job
  -> return immediately

Stop
  -> upsert assistant message
  -> refresh extract job
  -> return immediately

daemon / runner
  -> claim pending job
  -> 读取完整 session transcript
  -> 调 Phase 1 / Phase 2
  -> 更新 markdown 与 job 状态
```

## 命令面设计

### `corivo host import <host>`

第一版支持：

- `claude-code`
- `codex`

命令形态建议：

```bash
corivo host import <host> [options]
```

选项：

- `--all`
  - 显式全量导入该 host 可见的历史 session
- `--since <cursor>`
  - 从某个 host-specific cursor 之后增量导入
- `--limit <number>`
  - 限制本次导入 session 数量，用于调试或小批量重跑
- `--dry-run`
  - 只展示将导入多少 session，不写 DB
- `--target <path>`
  - 仅在需要 project-scoped host 路径解析时保留

第一版不建议支持：

- 复杂筛选 DSL
- 并发分片控制参数
- 直接在命令里触发 extraction / merge 同步完成

### 默认行为

命令行为：

- 若显式传 `--all`，执行全量历史导入
- 若显式传 `--since`，执行增量导入
- 若二者都不传：
  - 尝试读取该 host 的 `last_import_cursor`
  - 若存在，则按该 cursor 执行增量导入
  - 若不存在，则退出并提示用户使用 `--all`

示例错误文案：

```text
No previous import cursor found for claude-code.
Run `corivo host import claude-code --all` for the first full import.
```

## Host Import Adapter Contract

现有 `HostAdapter` 需要增加“历史导入”能力，但仍保持薄适配层原则。

建议扩展为：

```ts
export interface HostImportOptions {
  all?: boolean;
  since?: string;
  limit?: number;
  dryRun?: boolean;
  target?: string;
}

export interface ImportedSessionRecord {
  host: HostId;
  externalSessionId: string;
  startedAt?: number;
  endedAt?: number;
  cursor?: string;
  messages: ImportedMessageRecord[];
}

export interface ImportedMessageRecord {
  externalMessageId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
  ordinal?: number;
}

export interface HostImportResult {
  host: HostId;
  mode: 'full' | 'incremental';
  importedSessionCount: number;
  importedMessageCount: number;
  nextCursor?: string;
  summary: string;
}
```

Host adapter 增加：

```ts
importHistory?(options: HostImportOptions): Promise<HostImportResult>;
```

约束：

- adapter 只负责读取宿主历史、映射为统一 raw session contract
- adapter 不直接写 markdown
- adapter 不直接跑 extraction / merge
- adapter 不自己管理 job queue

## Host-Specific Import Sources

第一版虽然只支持两个宿主，但两者成熟度并不对称，spec 必须承认这一点。

### `claude-code`

当前仓库已经明确知道 Claude Code 的本地目录约定：

- `~/.claude/sessions/**`
- `~/.config/claude/sessions/**`

这些路径已经出现在 cold scan 的跳过规则里，说明仓库已经把它们视为真实存在、但敏感的本地会话目录。

因此第一版 `claude-code` import adapter 的正式数据源可定义为：

- 优先读取 `~/.claude/sessions/`
- 若不存在，则回退到 `~/.config/claude/sessions/`

第一版要求 adapter 负责：

- 遍历 session 文件
- 解析宿主侧 session id
- 还原 message 序列
- 归一化为 `ImportedSessionRecord`
- 产出可持久化的 `cursor`

第一版不要求：

- 支持所有历史格式版本
- 在 spec 中锁死 Claude session 文件内部 schema

原因：

- 当前仓库里还没有正式的 Claude history parser
- 真正的文件结构应以本机验证结果为准，而不是在 spec 中想象

因此 implementation 要求是：

- 先做一层 format probe
- 再做 parser
- parser 失败时跳过单个 session，而不是中断整批导入

### `codex`

当前仓库里对 Codex 的历史源只有较弱信号：

- `~/.codex/sessions/**` 出现在 cold scan 的跳过规则里
- hook 输入里已有 `prompt` / `last_assistant_message`
- 但仓库内没有正式的 history parser，也没有现成 session schema 文档

因此第一版 `codex` import adapter 的定位应更保守：

- 首选本地 `~/.codex/sessions/` 作为预期历史目录
- 若目录存在且格式可解析，则启用历史导入
- 若目录不存在或格式未识别，则返回结构化“不支持历史导入”结果，而不是假装成功

这意味着：

- `codex` 的 realtime ingest 是第一优先
- `codex` 的 history import 是“有条件支持”
- spec 应允许 adapter 返回“host installed, realtime ready, history import unavailable”

建议结果形态：

```ts
interface HostImportResult {
  host: HostId;
  mode: 'full' | 'incremental';
  importedSessionCount: number;
  importedMessageCount: number;
  nextCursor?: string;
  summary: string;
  unavailableReason?: string;
}
```

若 `codex` 缺少稳定历史源，CLI 可以输出：

```text
Codex history import is not available on this machine yet.
Realtime ingestion remains active through hooks.
```

### 结论

第一版不要强行追求：

- `claude-code` 与 `codex` 历史导入能力完全对称
- 两者必须共享同一 cursor 结构
- 两者必须在同一个迭代中拥有完全相同的导入覆盖率

真正需要对齐的是 contract：

- 都走 `corivo host import <host>`
- 都返回统一的结构化结果
- 都写入统一 raw session contract
- 都通过同一 job queue 进入后续处理链

## Cursor 语义

`--since <cursor>` 是 host-specific 的，不强求跨宿主统一格式。

### `claude-code` cursor

第一版优先使用 session 文件元数据可稳定比较的值，例如：

- session 文件最后更新时间
- session 结束时间
- 文件名中的时间序列

只要满足“可稳定增量扫描”即可。

### `codex` cursor

第一版允许更保守：

- 若存在稳定的 session 更新时间或文件名序列，则使用它
- 若不存在，则可暂时只支持 `--all`

因此 CLI contract 可以是：

- 命令面支持 `--since`
- adapter 可声明“该 host 当前不支持 incremental cursor”

### Cursor 持久化

每个 host 维护自己的 `last_import_cursor`。

不要求：

- 在 Corivo 层理解 cursor 的内部含义
- 不同宿主共用同一 cursor parser

Corivo 只负责：

- 读写字符串形式的 cursor
- 在下次 `host import <host>` 时回传给对应 adapter

## Raw Session Contract

本设计正式引入统一 raw session record contract。

### raw session

最小字段：

- `host`
- `external_session_id`
- `session_key`
- `project_identity?`
- `started_at?`
- `ended_at?`
- `source_type`
  - `history-import`
  - `realtime-hook`
- `last_import_cursor?`
- `ingest_status`

### raw message

最小字段：

- `session_key`
- `external_message_id?`
- `role`
- `content`
- `created_at?`
- `ordinal`
- `ingested_from`
  - `host-import`
  - `user-prompt-submit`
  - `assistant-stop`

### session_key

`session_key` 是 Corivo 内部统一主键，不直接暴露给宿主。

建议构成：

```text
<host>:<external-session-id>
```

若宿主没有稳定外部 id，则由 adapter 负责生成稳定映射键。

## 数据库模型

建议新增三张表。

### 1. `raw_sessions`

职责：

- 记录 session 级元数据
- 持久化导入来源与可恢复状态
- 作为 job 的聚合对象

建议字段：

- `id`
- `host`
- `external_session_id`
- `session_key`
- `source_type`
- `project_identity`
- `started_at`
- `ended_at`
- `last_message_at`
- `last_import_cursor`
- `created_at`
- `updated_at`

约束：

- `(host, external_session_id)` 唯一
- `session_key` 唯一

### 2. `raw_messages`

职责：

- 保存完整原文 transcript
- 支撑 session 级回放与重跑

建议字段：

- `id`
- `session_key`
- `external_message_id`
- `role`
- `content`
- `ordinal`
- `created_at`
- `ingested_from`
- `ingest_event_id`
- `created_db_at`
- `updated_db_at`

约束：

- 若有 `external_message_id`，则 `(session_key, external_message_id)` 唯一
- 否则至少 `(session_key, ordinal, role)` 唯一

### 3. `memory_processing_jobs`

职责：

- 持久化待处理任务
- 让 hook 与 runner 解耦
- 支撑重试、claim、恢复、幂等

建议字段：

- `id`
- `host`
- `session_key`
- `job_type`
  - `extract-session`
- `status`
  - `pending`
  - `running`
  - `succeeded`
  - `failed`
  - `cancelled`
- `dedupe_key`
- `priority`
- `attempt_count`
- `available_at`
- `claimed_at`
- `finished_at`
- `last_error`
- `payload_json`
- `created_at`
- `updated_at`

第一版只需要一种 job type：`extract-session`。

后续如需把 Phase 1 和 Phase 2 拆成两个 job，可在不破坏总体模型的前提下扩展。

## 幂等与去重

### 历史导入

历史导入必须允许重复执行。

要求：

- session upsert 而不是盲目 insert
- message upsert 而不是盲目 insert
- 对同一 `session_key` 只保留一个活跃的 `extract-session` pending job

推荐 dedupe key：

```text
extract-session:<session_key>
```

### 实时 hooks

hook 侧也必须是幂等的。

原因：

- 宿主可能重复触发
- shell 脚本可能重试
- 用户可能中断或恢复会话

要求：

- 使用稳定 `session_key`
- 优先使用宿主提供的 message id
- 若拿不到 message id，则允许通过 `ordinal` 或 payload hash 做保守去重

## Job Queue 语义

### hooks 的职责

#### `UserPromptSubmit`

只做：

1. 解析宿主事件
2. upsert `raw_sessions`
3. upsert 当前 user message 到 `raw_messages`
4. ensure `extract-session:<session_key>` job 存在
5. 立即返回

不做：

- Phase 1 prompt
- Phase 2 merge
- Markdown 写入
- 长时间等待

#### `Stop`

只做：

1. 解析宿主事件
2. upsert 当前 assistant message 到 `raw_messages`
3. 更新 `raw_sessions.last_message_at`
4. refresh 或 ensure `extract-session:<session_key>` job
5. 立即返回

这样设计的理由：

- user message 先入库，保证 recall 前的原文留存
- assistant message 再补入库，保证后续 extraction 拿到完整 turn
- hooks 始终维持轻量

### runner 的职责

`memory pipeline runner` 或独立 ingest runner 负责：

1. claim `pending` job
2. 读取该 `session_key` 下完整 transcript
3. 判断该 session 是否达到可处理条件
4. 调用 04-02 extraction / merge 流程
5. 更新 markdown 输出
6. 更新 job 状态

### 可处理条件

第一版建议：

- 历史导入的 session 默认直接可处理
- 实时 session 在 `Stop` 补齐 assistant message 后进入更高质量处理
- 若只有 user message 但尚无 assistant message，runner 可以：
  - 暂时跳过并延后重试
  - 或在超过一定时间后按“半完成 session”容忍处理

第一版推荐保守策略：

- 优先等待 assistant message
- 不在 `UserPromptSubmit` 后立即触发模型处理

## 状态模型

### raw session 不是 job queue

`raw_sessions` 只记录 session 元数据，不直接承担完整 job 生命周期。

processing 状态的权威来源应在 `memory_processing_jobs`，而不是把所有状态塞进 session 表。

### job 状态流转

```text
pending
  -> running
  -> succeeded

pending
  -> running
  -> failed
  -> pending   (重试)
```

### 重试策略

第一版建议：

- 指数退避不是必需，但要支持 `available_at`
- `attempt_count` 达到上限前允许自动重试
- 超过上限后保留 `failed`，由人工命令或后台再扫恢复

### claim 机制

runner 领取任务时必须：

- 原子地把 job 从 `pending` 改为 `running`
- 记录 `claimed_at`
- 避免多个进程重复消费同一 job

这部分可复用现有 run lock 思路，但 job claim 粒度应小于整个 pipeline run lock。

## 如何挂到现有 memory pipeline framework

现有 framework 的问题是“有 runner，没有正式输入编排”。

本设计建议补两层：

### 1. Source Layer 扩展

新增：

- `host-history-session-source.ts`
- `raw-session-job-source.ts`

其中：

- history import use case 负责把宿主历史转成 raw DB records
- scheduled runner 负责从 `memory_processing_jobs` 读取待处理 session

### 2. Pipeline 输入从 artifact 扩展为 session_key 集合

runner 不再只靠静态 stub session 列表，而是：

- 从 job source 读取一批 `session_key`
- 为这些 session 读取 transcript
- 把 transcript 提交给 extraction / merge stage

### 推荐演进

最终建议把现有 pipeline 语义从：

```text
collect sessions
  -> summarize
  -> consolidate
  -> append detail
  -> rebuild index
```

演进为：

```text
claim session jobs
  -> load raw session transcripts
  -> phase 1 raw extraction
  -> phase 2 final merge
  -> refresh affected indexes
  -> mark jobs succeeded
```

## Install 流程中的自动导入

保留 install 中的自动导入入口，但不把“自动导入”做成隐式 CLI 默认。

原则：

- install 是产品引导面，可以推荐自动导入
- `host import` 是工程入口，应避免暗中执行全量重型操作

建议流程：

1. `corivo host install claude-code`
2. install 完成后询问用户是否导入近期历史
3. 若同意，install use case 内部调用：

```bash
corivo host import claude-code --all
```

4. 返回“历史导入已开始，Corivo 会在后台整理”

这样既保留产品体验，也保持工程行为清晰。

## 宿主范围

第一版只要求：

- `claude-code`
- `codex`

不要求：

- `cursor`
- `opencode`
- `project-claude`

原因：

- 当前阶段目标是先把 memory 主链路跑通
- Claude Code 与 Codex 已经是本阶段主要验证宿主

## 性能要求

### hooks 快路径

`UserPromptSubmit` 与 `Stop` 的目标是：

- 只做轻量 DB 写入
- 不等待模型
- 不等待 markdown
- 不等待整条 pipeline 完成

主观要求：

- 用户不应明显感知到 Corivo 让 prompt submit 或 stop 变慢

### runner 慢路径

慢路径允许：

- 批量 claim jobs
- 单 session 重试
- 模型调用失败后回退

但必须：

- 不阻塞 hooks
- 不破坏原文留存

## 错误处理

### hooks 失败

若 hook 入库失败：

- 允许静默降级，不阻塞主对话
- 但应尽量记录到日志

第一版不要求把错误直接 surfacing 给用户。

### import 失败

若历史导入中某个 session 失败：

- 不应中断整个导入批次
- 应记录失败计数
- 成功导入的 session 仍然应继续入库与 enqueue

### processing 失败

若 extraction / merge 失败：

- job 进入 `failed`
- 保留 `last_error`
- 允许后续重试或手动重跑

## 推荐目录与模块

建议新增：

```text
packages/cli/src/application/hosts/import-host.ts
packages/cli/src/application/memory-ingest/
  ingest-realtime-message.ts
  enqueue-session-extraction.ts
packages/cli/src/raw-memory/
  types.ts
  repository.ts
  job-queue.ts
  import-cursors.ts
packages/cli/src/cli/commands/host-import.ts
packages/cli/src/memory-pipeline/sources/raw-session-job-source.ts
```

现有模块调整：

- `packages/cli/src/cli/commands/host.ts`
  - 新增 `import` 子命令
- `packages/cli/src/hosts/types.ts`
  - 增加 import contract
- `packages/plugins/hosts/claude-code/hooks/scripts/*`
  - 改成“快速入库 + 唤起 job”
- `packages/plugins/hosts/codex/*`
  - 若支持答前/答后 lifecycle，同样接入 raw ingest

## 第一版明确不做

- 独立外部消息队列
- 观察者模式事件总线
- 在 hook 中同步跑 extraction / merge
- session 级并发优先级精细调度
- 对每个 message 单独建复杂工作流 DAG
- 更多宿主适配

## 本次结论

Corivo 的上游编排层应采用：

- `corivo host import <host>` 作为统一历史导入入口
- raw layer 与 block layer 分离
- `UserPromptSubmit` / `Stop` 仅做轻量入库
- `memory_processing_jobs` 作为 DB-backed queue
- runner 异步消费 session 级 `extract-session` job
- install 流程保留显式自动导入入口

这样可以把：

- 历史导入
- 实时 hooks
- extraction / merge
- markdown 输出

真正接成一条可恢复、可增量、可重跑的 memory 主链路。
