# Corivo Memory 生成与召回闭环：补充架构说明

## 文档目的

这份文档不是阶段目标说明，而是配套解释本阶段需要遵守的关键架构原则，用来帮助团队在并行开发时减少分歧。

对应阶段目标文档：

- `docs/rfc/v0.11/corivo-memory-recall-milestone.md`

---

## 目标问题

为了完成“Memory 生成与召回闭环”，Corivo 必须把下面几件事接成一条线：

1. 宿主安装与接入
2. 历史会话导入
3. 实时 prompt 原文采集
4. 原文存储
5. 异步摘要与 Markdown memory 生成
6. 宿主 prompt hooks 注入 skill 和 memory index
7. Agent 通过 skill / CLI 做查询与召回

如果这几段链路分别由不同模块临时耦合，后续很快会出现：

- 宿主侧逻辑越来越厚
- SQLite 细节泄漏到 hooks 和 adapter
- 历史导入和实时采集走成两套流程
- Markdown memory 与原文 DB 职责混乱
- 未来切换存储后端时代价过高

所以本阶段虽然以“Memory 闭环落地”为主，但必须同时确定一些最小架构边界。

这里有一个关键前提：`Claude Code` 与 `Codex` 只是本阶段验证闭环的两个宿主承载面，不是阶段主题。文档和实现都不应把“multi-host”放在比 `Memory` 更高的位置。

另一个需要显式说明的产品决策是：这份文档按当前阶段目标，默认 Markdown memory 工作区位于用户目录下的 `.Corivo/`。这与仓库当前广泛使用的 `.corivo/` 命名并不完全一致，因此实现时应把它视为本阶段需要明确落定的产品决策，而不是默认沿用现状。

---

## 架构总览

```text
历史导入或实时 prompt
  -> ingest pipeline 归一化原文
  -> Raw message repository 持久化原文
  -> Async memory pipeline 生成 Markdown index + detail
  -> Prompt hooks 注入 Corivo skill + memory index
  -> Agent 通过 skill / CLI 查询摘要或原文
```

这条链路里最关键的是两层分离：

- 原文层：负责完整、可追溯、可查询的 source of truth
- memory 层：负责给 Agent 和用户使用的摘要化、索引化产物

---

## 架构原则

### 1. 原文是主链路起点，不是宿主安装

本阶段最先应该被建模和讨论的，是原文如何进入 Corivo，而不是先讨论宿主数量。

因此主链路顺序应该是：

- 原文进入
- 原文存储
- 摘要生成
- index 暴露
- recall 查询

宿主安装的重要性在于“为这条链路提供入口”，而不是主导产品叙事。

### 2. 安装入口单一

安装入口保持单一路径：

- `corivo host install <host>` 是主入口
- `corivo inject` 只作为兼容层存在
- host package 不扩展第二套安装逻辑

原因：

- 这样才能保证宿主安装行为、doctor、卸载、未来升级都由同一编排层控制
- 否则 `Claude Code`、`Codex`、其他宿主会逐渐长成彼此割裂的产品

### 3. 原文先入库，再做任何摘要

无论来源是历史导入还是实时 hooks，统一顺序必须是：

```text
读取原文
  -> 存到原文存储层
  -> 标记处理状态
  -> 异步进入摘要流水线
  -> 生成 / 追加 Markdown memory
```

原因：

- 保证原文可追溯
- 保证后续摘要可重做
- 保证查询原文时不依赖 Markdown

### 4. DB 与 Markdown 是两层，不是一层

这阶段必须强约束两个事实：

#### DB 层负责什么

- 存原文消息
- 存消息来源与宿主信息
- 存处理状态、导入状态、摘要状态
- 支撑后续摘要重跑与原文查询

#### Markdown 层负责什么

- 对 Agent 可见的 memory index
- 摘要化后的记忆详情
- 面向使用链路的轻量内容组织

Markdown 不承担：

- 原文完整留存
- 唯一数据源
- 历史消息审计

### 5. 宿主 adapter 尽量薄

宿主 adapter 只做这些事：

- 安装宿主所需资产
- 响应宿主事件或 hooks
- 调用 Corivo CLI / runtime
- 把结果注入宿主环境

不要把这些逻辑塞进宿主 adapter：

- 原文模型定义
- 摘要策略
- 存储后端决策
- 查询排序逻辑

原因：

- 不同宿主能力差异很大，但 Corivo 的核心记忆逻辑不应该复制到每个宿主里

### 6. 历史导入和实时采集共用同一条后处理流水线

它们的入口不同，但后续流程应该尽量一致：

- 都产出统一的 raw message record
- 都进入同一套待处理队列
- 都通过同一套摘要管道生成 Markdown memory

原因：

- 这样“导入历史会话”和“继续实时使用”才是同一个产品能力，而不是两个孤立功能

### 7. 存储后端设计成可插拔，但当前实现不要过度抽象

本阶段的现实前提是：

- 当前已有本地 SQLite
- 未来可能接 SaaS 存储与向量服务

因此建议做法是：

- 定义 repository / store contract
- 当前先由 SQLite 实现
- 让 ingest、summary、query 都依赖接口，不直接依赖 SQLite 细节

不建议本阶段做的事：

- 过早引入复杂 provider 框架
- 为还没确定的 SaaS 细节设计大量抽象层

---

## 建议的能力分层

### 1. Ingest Layer

职责：

- 把宿主历史消息和实时消息转换成统一输入
- 归一化消息结构、来源、会话标识、时间戳

建议统一输入形态：

- host id
- session id / conversation id
- role
- content
- created at
- source type: `history-import` / `realtime-hook`

### 2. Raw Storage Layer

职责：

- 持久化原文
- 持久化处理状态
- 提供按宿主、按会话、按时间、按状态的查询能力

这层是未来最需要可插拔的部分。

### 3. Memory Pipeline Layer

职责：

- 从原文中取出未处理内容
- 做摘要、归并、索引更新
- 生成 Markdown index 与 detail

这层应该天然异步，不阻塞 hooks 主流程。

### 4. Recall / Query Layer

职责：

- 响应 skill / CLI 查询
- 决定返回摘要还是原文
- 控制返回大小和格式

### 5. Projection Layer

职责：

- 把 memory index 暴露给宿主
- 把 Corivo skill 暴露给 Agent
- 在 prompt hooks 中完成最小上下文注入

### 6. Host Layer

职责：

- `claude-code`
- `codex`
- 后续其他宿主

对外暴露：

- install
- doctor
- history import trigger
- prompt hook bridge

这一层放在最后，不是因为它不重要，而是因为它在这次阶段中承担的是承载职责，不是主模型职责。

---

## 关键数据流

### 数据流 A：历史会话导入

```text
用户选择导入宿主历史会话
  -> host importer 读取历史记录
  -> ingest layer 归一化
  -> raw storage 持久化
  -> 任务入队为 pending summary
  -> async pipeline 生成 Markdown memory
```

### 数据流 B：实时 prompt submit

```text
用户提交 prompt
  -> prompt hook 触发
  -> 原文写入 raw storage
  -> hook 注入 Corivo skill + memory index
  -> 主对话继续
  -> async pipeline 稍后处理本轮原文
```

### 数据流 C：后续查询召回

```text
Agent 读取 injected skill / index
  -> 发起 Corivo 查询
  -> query layer 检索摘要或原文
  -> 返回给 Agent
  -> Agent 继续把结果追加进上下文
```

---

## 目录与资产建议

本阶段不要求一次性重构完目录，但建议遵守下面的责任边界：

### `packages/plugins/hosts/*`

只放：

- hooks
- skills
- templates
- adapter scripts
- install 所需宿主资产

不要放：

- 原文处理主逻辑
- 摘要流水线主逻辑
- 存储主逻辑

### `packages/cli`

应继续承载：

- ingest orchestration
- raw storage contract 与当前实现
- async memory pipeline
- query / recall CLI
- host install 编排

原因是当前阶段的“闭环大脑”仍然在 CLI/runtime 这一侧。

---

## 性能与稳定性要求

### 1. Hook 快路径

实时 prompt hooks 必须足够轻：

- 能快速写入原文
- 能快速注入最小上下文
- 不能等待完整摘要结束

### 2. 异步摘要可恢复

如果摘要中断或失败，应允许：

- 重新扫描未处理原文
- 重试摘要任务
- 不影响原文查询能力

### 3. 多宿主隔离

不同宿主的数据至少要能按以下维度隔离：

- host
- session / conversation
- source type

否则后续导入、查询、调试都会失控。

---

## 本阶段建议先不锁死的点

为了不在错误的方向上过度设计，下面这些点建议只留原则，不急于定死：

- Markdown memory 的最终文件命名细节
- SaaS 存储接口的最终协议
- skill 与未来 MCP 的最终分工
- 召回排序的最终算法
- 用户意图预取的缓存策略

这类问题可以在闭环跑通后，再基于真实使用反馈收敛。

---

## 和后续阶段的关系

如果本阶段完成，后续阶段就有了稳定基础去扩展：

- 更强的 recall / review 体验
- 用户意图驱动的预先查找
- MCP 形态接入
- 云端存储与向量化服务
- 更多宿主扩展

如果本阶段没有完成，后续能力会继续建立在分散模块之上，团队会越来越难协作。

所以这份补充架构说明的核心只有一句话：

先把“原文入库 -> 异步摘要 -> hooks 注入 -> skill 查询”这条多宿主记忆主链路稳定下来，再谈更强的智能化能力。
