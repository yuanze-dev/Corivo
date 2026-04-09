# Import-To-Supermemory Memory Extraction Design

Date: 2026-04-09
Status: Proposed

## Goal

让导入链路接入 Supermemory，但不再把会话总结成单条 summary 上传。

新的目标是：

- `host import` 继续导入原始会话
- memory pipeline 从会话中抽取“未来可能有用的信息”
- 将这些离散 memory 上传到 Supermemory
- 避免把整段 transcript 或低价值 summary 直接写入远端

## Chosen Approach

采用方案 2，并调整 pipeline 的最终产物语义：

- 保留现有 `raw session/message -> memory pipeline` 主链路
- 不在 `host import` 阶段直接写 Supermemory
- pipeline 不再以“session summary”作为远端写入对象
- pipeline 改为从会话中抽取多条离散 memory
- 新增 provider sync stage，将这些 memory 逐条写入 Supermemory

## Non-Goals

- 不把整段会话 transcript 直接上传到 Supermemory
- 不在第一版使用 Supermemory batch endpoint 作为主写入方式
- 不把大量中间 trace metadata 写入 Supermemory
- 不改变 `corivo host import <host>` 的 CLI 行为

## Extracted Memory Definition

每条上传到 Supermemory 的记忆必须是“脱离当前会话也有价值”的单条信息。

首批支持以下类型：

- `fact`
- `preference`
- `decision`
- `constraint`
- `follow_up`

每条 memory 必须满足：

- 单条陈述只表达一个点
- 对后续问答、决策或执行有帮助
- 不是寒暄、过程噪音或一次性命令回显
- 不依赖完整会话上下文才能理解

## Pipeline Behavior Change

当前思路中的“summary”不再作为最终远端写入单位。

调整后：

1. 从 raw session/messages 中抽取候选 memories
2. 过滤低价值或重复候选项
3. 产出最终离散 memories 列表
4. 逐条同步到 provider

本地仍保留 raw data 和中间 artifacts，供调试、回放、fallback 使用。

## Supermemory Upload Model

每条 memory 作为一条独立 document 上传。

远端只保留：

- `content`
- `customId`

其中：

- `content` 是规范化后的最终 memory 文本
- `customId` 用于幂等和去重

不将会话级来源、证据 message id、抽取时间等中间过程字段上传到 Supermemory；这些只保留在 Corivo 本地 artifacts 中。

## customId Strategy

`customId` 必须稳定、可重算，并且尽量表达“同一条 memory”而不是“同一次会话”。

格式：

```text
corivo:{projectTag}:{hash(normalized_content)}
```

`normalized_content` 的第一版规范化规则：

- trim 首尾空白
- 合并连续空白
- 不拼入 session id、message id、时间戳等动态字段

这样可保证：

- 同一条 memory 被重复抽出时不会无限新增远端 document
- pipeline 重跑时可以安全重试
- 后续 incremental import/realtime ingest 可以复用同一幂等模型

## Sync Placement

Supermemory 写入放在 memory pipeline 最终产物之后，而不是 `host import` use case 内。

推荐新增独立 stage，例如：

- `sync-provider-memories`

职责：

- 读取最终离散 memories
- 为每条 memory 生成 `customId`
- 调用 provider `save/add`
- 记录成功/失败结果

## Failure Policy

第一版采用“本地成功优先，远端异步补偿”的策略：

- memory extraction 成功不应因为一次远端写入失败而整体回滚
- 远端失败项应被记录为待重试
- 后续 incremental pipeline 或 heartbeat 可继续补传
- 依赖稳定 `customId` 保证重试幂等

## Why Not Batch First

虽然 Supermemory 文档和 changelog 提到了 batch ingestion，但第一版不将其作为主路径。

原因：

- 当前需求优先级是幂等、可观察、易调试，不是吞吐极限
- 官方文档主路径更强调 `add + customId + retry`
- 逐条上传更容易定位坏样本和抽取质量问题
- 若后续验证吞吐成为瓶颈，再将上传实现替换为 batch

## Implementation Areas

预期会涉及：

- 会话抽取 prompt / schema，从 summary 导向切换为 memory extraction 导向
- memory pipeline final artifact 结构
- provider sync stage
- supermemory provider 的 `customId` 支持
- 重试/补传状态记录

## Acceptance Criteria

- `host import` 后，pipeline 产出的是多条离散 memory，而不是单条 session summary
- Supermemory 中看到的是可复用的离散 memory 文本
- 重跑同一批数据不会在 Supermemory 中产生明显重复
- 远端暂时失败不会破坏本地导入与抽取主链路
