# Corivo Memory Pipeline Framework Design

**日期**: 2026-04-01
**状态**: 提议中
**范围**: `packages/cli`

---

## 目标

为 Corivo 设计一套可扩展的 memory 加工框架，用于承载以下两类流程：

- 初始化或用户手动触发时，对 Claude Code 历史 session 做全量、多层加工
- 定时触发时，对 DB 中待更新的 memory blocks 做增量、多层加工

本轮只定义“框架与边界”，不实现具体内部算法。重点解决：

- 流程如何拆层，而不是一次性完成
- 不同流程如何复用公共步骤
- Claude/Codex 等模型调用如何作为可替换能力接入
- detail layer 与 index layer 如何在结构上解耦

本轮不解决：

- Claude prompt 细节
- session 如何切片
- block 是否需要更新的判定算法
- memory index 的具体检索结构
- detail file 的最终内容模板

## 背景

当前仓库已经有两类能力：

- `extraction/`：统一的 provider 调用能力，已支持 `claude` 与 `codex`
- `engine/heartbeat.ts`：定时处理 DB block 的后台循环

但当前缺少一层“流程编排”：

- `extraction/` 只会执行一次模型调用，不负责多阶段加工
- `heartbeat` 只适合触发和短周期 DB 处理，不适合承担长耗时、多阶段、可恢复的离线总结任务

因此需要引入独立的 memory pipeline framework。

## 核心概念

### Pipeline

`Pipeline` 表示一整条 memory 加工流程。

它负责定义：

- 这条流程有哪些阶段
- 阶段之间的先后顺序
- 这条流程由什么触发
- 流程失败后如何恢复或重试

可以理解为一条生产线。

### Stage

`Stage` 表示 pipeline 中的一个步骤。

它只做一件事：

- 读取上一阶段产物
- 进行一次转换
- 产出新的结果

一个 stage 不应同时承担“收集输入 + 模型总结 + 文件落盘 + 索引刷新”四类职责。

### Artifact

`Artifact` 表示某个 stage 的输出产物。

例如：

- session 列表
- session summaries
- global summary
- detail records
- memory index

artifact 是阶段之间传递的边界，而不是临时散落在函数里的局部变量。

## 设计原则

### 1. Claude 调用不是架构中心

Claude Code 只是某些 `summarize` stage 的内部实现方式。

架构中心应是：

- pipeline
- stage
- artifact

而不是某个具体模型 provider。

### 2. 支持多层完成

框架必须允许：

- 一层总结 session
- 二层总结 summary
- 三层把 summary 投影成 index

不要求一轮调用直接得到最终 memory。

### 3. detail 与 index 分层

memory 至少分为两层：

- `detail layer`：较完整、可追加、可回溯的长期记录
- `index layer`：较轻量、面向检索、可重建的索引层

两者不能混为一个 stage 的副作用。

### 4. heartbeat 只负责触发

`heartbeat` 可以触发 scheduled pipeline，但不应直接承担整套总结逻辑。

长流程执行、阶段状态记录、失败恢复应由 pipeline runner 负责。

### 5. 先定义边界，再填实现

本次设计要让其他开发者可以分工实现，因此必须先固定：

- 模块边界
- 阶段输入输出
- 运行状态
- 文件落盘位置

而不是先写一个大函数把流程跑通。

## 范围内的两条 Pipeline

### 1. Init Pipeline

用于初始化和用户手动触发的全量重建。

目标：

- 全量遍历 Claude Code 历史 session
- 对 session 做逐层总结
- 产出 detail layer
- 重建或刷新 index layer

### 2. Scheduled Pipeline

用于后台定时触发的增量更新。

目标：

- 从 DB 中找出待更新的 blocks
- 对这些 blocks 做总结
- 把结果追加到 detail layer
- 更新 memory index

## 推荐目录结构

建议新增目录：

```text
packages/cli/src/memory-pipeline/
  index.ts
  types.ts
  runner.ts
  registry.ts
  artifacts/
    artifact-store.ts
  pipelines/
    init-pipeline.ts
    scheduled-pipeline.ts
  stages/
    collect-claude-sessions.ts
    summarize-session-batch.ts
    consolidate-session-summaries.ts
    collect-stale-blocks.ts
    summarize-block-batch.ts
    append-detail-records.ts
    rebuild-memory-index.ts
  sources/
    claude-session-source.ts
    stale-block-source.ts
  processors/
    model-processor.ts
  state/
    run-lock.ts
    run-manifest.ts
```

说明：

- `pipelines/` 定义流程本身
- `stages/` 定义阶段职责
- `sources/` 负责收集输入
- `processors/` 负责模型调用抽象
- `artifacts/` 负责阶段产物持久化
- `state/` 负责运行状态、锁和恢复信息

## Pipeline 与 Stage 的关系

关系可以简化为：

```text
Pipeline = 一组有顺序的 Stage
Stage = 消费输入 Artifact，产出输出 Artifact
```

在 Corivo 中更具体地看：

```text
Init Pipeline
  1. collect sessions
  2. summarize sessions
  3. consolidate summaries
  4. append detail records
  5. rebuild memory index
```

其中：

- `Init Pipeline` 是总流程
- 1 到 5 是具体 stages
- 每一步都会产出新的 artifacts

## Artifact 层次

### Detail Layer

detail layer 用于存储完整程度更高、允许追加的长期记录。

要求：

- 落在 `~/.corivo/` 下，由 Corivo 自管
- 支持 append-only 写入
- 允许后续再次被更高层 stage 读取和再总结

建议位置：

```text
~/.corivo/memory/artifacts/detail/
```

### Index Layer

index layer 用于存储面向检索的轻量投影。

要求：

- 可由 detail layer 重建
- 体积小于 detail layer
- 可供 query/runtime/push 等能力消费

建议位置：

```text
~/.corivo/memory/artifacts/index/
```

### Run Artifacts

每次 pipeline 运行还需要自己的中间产物和状态记录。

建议位置：

```text
~/.corivo/memory/runs/<run-id>/
```

可包含：

- 阶段输出摘要
- 失败信息
- manifest
- cursor

## Init Pipeline 设计

推荐阶段如下：

### Stage 1: `collect-claude-sessions`

职责：

- 收集所有 Claude Code 历史 session 的元信息
- 产出可供后续批处理的 session work items

输入：

- 触发参数

输出 artifact：

- `claude-session-list`

本阶段不负责：

- 调用模型
- 写 detail files
- 更新 index

### Stage 2: `summarize-session-batch`

职责：

- 按批次消费 session
- 调用模型生成 session 级总结

输入 artifact：

- `claude-session-list`

输出 artifact：

- `session-summary-batch`

说明：

- 该 stage 允许多轮执行
- 具体的分片策略、prompt、重试逻辑由后续实现补齐

### Stage 3: `consolidate-session-summaries`

职责：

- 对多个 session summary 再做一层全局整合
- 为 detail layer 和 index layer 提供更稳定的上游输入

输入 artifact：

- `session-summary-batch`

输出 artifact：

- `global-session-summary`

说明：

- 这一层明确表达“多层完成”的要求
- 不应和 Stage 2 混写在一起

### Stage 4: `append-detail-records`

职责：

- 把上一层总结结果落入 detail layer
- 以 append-only 方式写入可追加文件

输入 artifact：

- `global-session-summary`

输出 artifact：

- `detail-record`

说明：

- detail file 的精确命名与内容模板本轮不固定
- 但必须由统一的 artifact store 管理

### Stage 5: `rebuild-memory-index`

职责：

- 从 detail layer 或上游 summary artifacts 生成 index layer

输入 artifact：

- `detail-record`

输出 artifact：

- `memory-index`

说明：

- index 是 detail 的投影，不是 detail 的副作用
- 后续实现可以选择全量重建或分片重建

## Scheduled Pipeline 设计

推荐阶段如下：

### Stage 1: `collect-stale-blocks`

职责：

- 从 DB 中找出待更新的 blocks

输入：

- 定时触发上下文

输出 artifact：

- `stale-block-list`

说明：

- 当前仓库尚未有“是否更新”的正式标记
- 本设计只保留该阶段接口，不绑定具体筛选算法

### Stage 2: `summarize-block-batch`

职责：

- 对待更新 blocks 做增量总结

输入 artifact：

- `stale-block-list`

输出 artifact：

- `block-summary-batch`

### Stage 3: `append-detail-records`

职责：

- 将 block summary 追加写入 detail layer

输入 artifact：

- `block-summary-batch`

输出 artifact：

- `detail-record`

说明：

- 该 stage 可以与 init pipeline 复用同一实现
- 区别只在输入 artifact 类型不同

### Stage 4: `refresh-memory-index`

职责：

- 根据新增 detail records 刷新 memory index

输入 artifact：

- `detail-record`

输出 artifact：

- `memory-index`

说明：

- 和 init pipeline 的 `rebuild-memory-index` 是同类 stage
- 区别在于 scheduled pipeline 更偏增量刷新

## 关键接口

以下接口只定义骨架，不定义完整内部字段。

### Pipeline Trigger

```ts
export interface PipelineTrigger {
  type: 'init' | 'manual' | 'scheduled';
  requestedBy?: string;
  runAt: number;
  scope?: Record<string, unknown>;
}
```

### Work Item

```ts
export interface WorkItem {
  id: string;
  kind: 'session' | 'block' | 'summary' | 'index-fragment';
  sourceRef: string;
  freshnessToken?: string;
  metadata?: Record<string, unknown>;
}
```

### Artifact Descriptor

```ts
export interface ArtifactDescriptor {
  id: string;
  kind: string;
  version: number;
  path: string;
  source: string;
  createdAt: number;
  upstreamIds?: string[];
  metadata?: Record<string, unknown>;
}
```

### Stage Result

```ts
export interface PipelineStageResult {
  stageId: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  inputCount: number;
  outputCount: number;
  artifactIds: string[];
  cursor?: string;
  error?: string;
}
```

### Stage Definition

```ts
export interface MemoryPipelineStage {
  id: string;
  run(context: MemoryPipelineContext): Promise<PipelineStageResult>;
}
```

### Pipeline Definition

```ts
export interface MemoryPipelineDefinition {
  id: 'init-memory-pipeline' | 'scheduled-memory-pipeline';
  stages: MemoryPipelineStage[];
}
```

## 需要预留的扩展口

### 1. `ModelProcessor`

职责：

- 接收一批文本输入
- 调用 Claude/Codex 等 provider
- 返回结构化处理结果

本轮要求：

- 只定义接口
- 默认实现可为空壳

原因：

- 后续开发者可能先接 Claude，再扩 Codex
- provider 不是 pipeline 框架的中心

### 2. `ChunkingStrategy`

职责：

- 决定 session 或 block 如何分批

本轮要求：

- 只保留扩展点
- 不固定按 session、按项目、按时间窗的具体策略

### 3. `MergeStrategy`

职责：

- 决定多轮 summary 如何被整合为更高层结果

本轮要求：

- 只定义抽象
- 不实现具体合并规则

### 4. `FreshnessPolicy`

职责：

- 决定哪些 block/session 需要重跑

本轮要求：

- 只定义接口，不依赖当前 DB schema

### 5. `IndexProjection`

职责：

- 决定 detail layer 如何投影成 index layer

本轮要求：

- 与 summarize stage 解耦
- 单独作为 index stage 的内部能力

## Artifact Store 约束

建议引入统一的 `ArtifactStore`，负责：

- 为 artifacts 分配路径
- 统一写入和读取
- 记录 artifact descriptor
- 隔离 detail/index/run 三类产物

建议目录：

```text
~/.corivo/memory/
  artifacts/
    detail/
    index/
  runs/
    <run-id>/
      manifest.json
      stages/
```

要求：

- pipeline 本身不直接拼接任意文件路径
- stages 不直接绕过 store 写文件

## Runner 与状态管理

需要一个 `MemoryPipelineRunner` 统一负责：

- 执行 pipeline
- 串行运行各 stage
- 收集每个 stage 的结果
- 落盘 run manifest
- 处理失败恢复

### Run Manifest

建议每次运行生成：

```json
{
  "runId": "run_xxx",
  "pipelineId": "init-memory-pipeline",
  "trigger": "manual",
  "status": "running",
  "stages": []
}
```

用途：

- 让系统知道当前跑到哪一层
- 让失败后的重试有落点
- 让其他开发者可以调试阶段边界

### Run Lock

需要显式锁，避免以下冲突：

- 用户手动触发 init pipeline
- heartbeat 同时触发 scheduled pipeline

首版要求：

- 同一时刻只允许一个 memory pipeline 在运行

后续若要并发，再单独扩展。

## 与现有模块的边界

### `src/extraction/`

保留当前职责：

- 一次 provider 调用
- 统一返回状态

不新增职责：

- pipeline 编排
- 阶段状态管理
- artifact 写入

### `src/engine/heartbeat.ts`

建议新增能力：

- 在定时周期内触发 scheduled pipeline

不建议新增职责：

- 长时间执行多层总结
- 直接写 detail files
- 直接更新 memory index

### `src/cli/commands/`

建议新增一个显式入口，例如：

- `corivo memory run --full`
- `corivo memory run --incremental`

命令职责应仅限：

- 解析参数
- 触发对应 pipeline

不应把阶段实现写在 command 里。

## 推荐实施顺序

为了便于多人协作，建议分阶段落地：

### Phase 1: Skeleton

交付内容：

- `types.ts`
- `runner.ts`
- `artifact-store.ts`
- `run-manifest.ts`
- `init-pipeline.ts`
- `scheduled-pipeline.ts`

要求：

- 可以跑空壳 stage
- 能记录运行状态

### Phase 2: Source Stages

交付内容：

- `collect-claude-sessions`
- `collect-stale-blocks`

要求：

- 先产出 work items
- 不要求接模型

### Phase 3: Summarize Stages

交付内容：

- `summarize-session-batch`
- `summarize-block-batch`
- `ModelProcessor`

要求：

- 接入 `extractWithProvider()`
- 先支持 Claude 即可

### Phase 4: Persist and Index

交付内容：

- `append-detail-records`
- `rebuild-memory-index`
- `refresh-memory-index`

要求：

- detail 与 index 路径明确
- 两层正式打通

### Phase 5: Trigger Integration

交付内容：

- CLI 手动触发入口
- heartbeat 定时触发入口

## 决策总结

本设计的核心决策如下：

- 将 memory 加工定义为独立 pipeline framework，而不是单个 Claude 调用入口
- 将 `pipeline -> stage -> artifact` 作为主结构
- 将 detail layer 与 index layer 视为两类独立产物
- 将 Claude/Codex 等 provider 收敛为 stage 内部的 processor
- 将 heartbeat 与 CLI 收敛为 trigger，而不是业务主编排层

这样做的价值在于：

- 允许多层完成，而不是一步完成
- 便于其他开发者分工实现
- 后续增加新的 provider、新的 source、新的阶段时，不需要推翻整体结构

## 开放问题

以下问题刻意留给后续实现阶段：

- Claude session 的物理来源和扫描边界
- detail record 的具体文件命名和内容格式
- memory index 的最终结构
- stale block 的判定策略
- 多轮 summary 的 chunk 和 merge 策略
- 单次 run 的批量大小与超时策略
