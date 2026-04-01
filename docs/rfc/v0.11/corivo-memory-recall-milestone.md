# Corivo 阶段节点：Memory 生成与召回闭环

## 一句话目标

让 Corivo 跑通从原文沉淀、Memory 生成、到后续召回使用的最小闭环，并先在 `Claude Code` 与 `Codex` 两个宿主上验证这条链路。

---

## 为什么现在做这个阶段

Corivo 当前已经具备一部分宿主安装能力，也已经有本地 DB、CLI、心跳引擎和部分宿主集成资产，但真正关键的 Memory 主链路还没有被完整打通：

- 历史会话、实时会话、摘要记忆、原文查询之间还没有被产品化成一条完整路径。
- DB 原文、Markdown memory、skill 查询、召回体验之间还缺少统一目标。
- 宿主接入已有进展，但它更像载体，还不是这次阶段的主目标。

这个阶段的意义，不是继续堆单点能力，而是先把 Corivo 最核心的 Memory 价值闭环跑通：

- 用户可以把已有历史会话纳入 Corivo。
- 新产生的对话原文会持续进入 Corivo。
- Corivo 会把原文沉淀成可被 Agent 使用的 Memory 索引与摘要。
- Agent 在后续对话中能够通过 skill 或 CLI 继续取回摘要或原文。

宿主范围这次只先落在 `Claude Code` 和 `Codex`。它们是这次验证闭环的两个承载面，不是阶段本身的主题。

只有这条 Memory 闭环跑通，后续的 SaaS 存储、预取、自动召回、跨宿主协同等能力才有稳定落点。

---

## 本阶段的成功定义

本阶段完成时，应满足下面这条最小闭环：

```text
历史或实时消息原文进入 DB
  -> 异步生成 / 追加 Markdown memory
  -> 宿主 prompt hooks 注入 Corivo skill + memory index
  -> Agent 通过 skill / CLI 查询摘要或原文
  -> Corivo 的记忆在后续对话中被重新使用
```

更具体地说，团队需要交付以下结果：

1. 用户可以主动导入历史会话，且导入内容先进入原文 DB。
2. 实时会话在 `UserPromptSubmit` 或等价时机，能够把新消息写入 Corivo。
3. 原文进入后，会异步沉淀为 Markdown memory。
4. Markdown memory 存放在用户目录下的 `.Corivo/` 工作区中，承担“索引 + 摘要详情”的角色。
5. 宿主 prompt hooks 能注入 Corivo skill 与 memory index。
6. Agent 在后续工具调用阶段，能够通过 skill 驱动 CLI 查询到相关摘要或原文。
7. 这套闭环先在 `Claude Code` 与 `Codex` 两个宿主上跑通。

---

## 这阶段到底在做什么

从产品角度看，这不是几个零散功能，而是一条统一的 Memory 链路：

### 1. 原文沉淀

Corivo 先拿到“未经加工的原始会话内容”。

- 历史导入时，先导入原文到 DB
- 实时会话时，在 prompt submit / user prompt hooks 阶段把新消息原文写入 DB
- DB 是原文事实来源，后续摘要、索引、查询都从这里派生

### 2. Memory 生成

Corivo 再把原文加工为用户和 Agent 都能使用的 Memory。

- 一层是 Markdown index，用于告诉 Agent 有哪些记忆可以查
- 一层是 Markdown 详情，用于保留摘要化、结构化后的 memory 内容
- 这层更偏“索引 + 摘要”，不是原文数据库的替代

### 3. 召回使用

当用户后续继续和 Agent 交互时，Corivo 的 Memory 应该能被重新使用。

- 宿主 hooks 要在 prompt 前注入 Corivo skill 与 memory index
- Agent 在需要时可调用 skill，再经由 CLI 查询摘要或原文
- 这样记忆不是“静态存着”，而是能在使用链路中被取回

### 4. 宿主承载

这次阶段并不追求“多宿主本身”，而是选择两个宿主来承载和验证 Memory 闭环。

- `Claude Code` 与 `Codex` 先作为验证面
- Host install 仍然重要，但它是为 Memory 闭环服务
- 不把“支持更多宿主”作为本阶段目标

---

## 用户闭环

### 闭环 A：安装后的首次导入

```text
用户执行 host install
  -> Corivo 写入宿主所需 hooks / instructions / skill 资产
  -> Corivo 询问是否导入该宿主历史会话
  -> 用户选择导入
  -> 宿主历史原文写入 DB
  -> 异步摘要任务生成 Markdown memory
  -> 用户后续对话时可感知到 Corivo 已有历史上下文
```

### 闭环 B：后续实时使用

```text
用户在宿主里提交新 prompt
  -> hooks 先把用户消息原文写入 Corivo
  -> hooks 同时注入 Corivo skill + memory index
  -> Agent 在需要时调用 skill / CLI
  -> Corivo 返回摘要或原文
  -> 这次新消息稍后再被异步摘要进 Markdown memory
```

这两个闭环共同构成“Memory 生成与召回闭环”。

---

## 模块拆分

为避免团队在实现时互相阻塞，这个阶段建议拆成 6 个模块。

### 模块 1：原文存储层

目标：建立“原文先入库”的统一底座，并为未来替换存储后端做准备。

需要解决：

- 原文消息的数据模型
- 历史导入与实时 hooks 的统一写入接口
- 本地 SQLite 与未来 SaaS 存储的可插拔抽象
- 原文、处理状态、摘要状态、查询链路之间的关系

交付判断：

- 当前阶段先跑在本地 DB 上
- 存储接口已经具备后端可替换的边界，而不是把 SQLite 细节写死到主流程

### 模块 2：历史会话导入

目标：让用户在安装后可以主动把某个宿主的历史会话导入 Corivo。

需要解决：

- 按宿主选择导入源
- 历史会话读取与格式归一
- 导入任务状态、去重与幂等
- 导入流程与后续摘要流程解耦

交付判断：

- 用户可以显式触发某个宿主的历史导入
- 导入内容先进入 DB，再进入异步摘要流程

### 模块 3：Markdown Memory 生成层

目标：把原文持续转化为 Agent 可消费的 memory 资产。

需要解决：

- `.Corivo/` 下的目录布局
- Markdown index 与 Markdown 详情的分层结构
- 异步处理队列与增量追加策略
- 摘要更新、覆盖、补充和去重规则

交付判断：

- 导入和实时消息都可以异步沉淀为 Markdown memory
- Agent 可通过 index 快速知道“有什么可查”

### 模块 4：Query / Recall 执行层

目标：让 Agent 在工具调用阶段真正把 Corivo 用起来。

需要解决：

- skill 如何调用 CLI
- CLI 如何根据查询返回摘要或原文
- 返回结果的格式边界
- 摘要与原文的权限、性能和大小控制

交付判断：

- Agent 能从 Corivo 取回需要的内容，而不仅仅看到一个索引文件

### 模块 5：Prompt Hooks 与 Skill 注入

目标：让宿主在用户提交 prompt 时，Corivo 已经在场。

需要解决：

- `UserPromptSubmit` 或等价触发点的统一抽象
- hooks 中原文写入与 memory index 注入的先后关系
- Corivo skill 的宿主注入方式
- 失败时的降级行为，避免阻塞用户正常对话

交付判断：

- 用户提交 prompt 后，Corivo 能先接住输入
- Agent 同轮就能获得使用 Corivo 的 skill 和 memory index

### 模块 6：Host Install 与宿主接入

目标：把 `Claude Code` 与 `Codex` 接成这条闭环的验证面。

需要解决：

- `corivo host install <host>` 作为主入口
- 宿主安装资产如何分发
- hooks、instructions、skill、notify 等宿主侧接入如何落地
- 安装结果如何校验、回滚、doctor

交付判断：

- 两个宿主都可完成基本安装和接入
- 宿主具备承载 Memory 闭环的最小能力

---

## 团队并行工作流

建议按下面的协作方式推进，避免所有人都堵在一条主线上：

### 工作流 A：Memory 主链路线

- 原文数据模型
- 历史导入
- 异步摘要流水线
- query / recall 返回格式

### 工作流 B：导入与存储线

- 实时 hooks 写入
- DB 可插拔抽象
- 处理状态与队列状态

### 工作流 C：宿主承载线

- Host install 编排
- 宿主 hooks / instructions / skills 注入
- host doctor 与接入验证

这三条线可以并行，但要共享三条统一原则：

1. 原文先入库，再做任何摘要或索引。
2. Markdown memory 是摘要层，不替代原文 DB。
3. 宿主侧逻辑尽量薄，核心编排收敛回 CLI / runtime。

---

## 里程碑

### M1：原文入库打通

目标：历史导入与实时 prompt 都能把原文送进同一套存储层。

完成标志：

- 用户可主动导入某宿主历史会话
- 实时 prompt submit 已能写入原文
- 原文写入接口已从宿主实现中抽离

### M2：Memory 生成打通

目标：原文进入后，可以异步沉淀出可消费的 Markdown memory。

完成标志：

- `.Corivo/` 下形成稳定 memory 目录结构
- 有 index 文件
- 有详情摘要文件
- 导入与实时路径都能复用同一摘要流水线

### M3：召回闭环打通

目标：prompt hooks、skill 注入、CLI 查询已经串成一条真实可用链路。

完成标志：

- prompt hooks 可注入 Corivo skill + memory index
- Agent 可通过 skill / CLI 取回摘要或原文
- 用户能真实感知到“Corivo 的记忆参与了这次对话”

### M4：宿主验证打通

目标：`Claude Code` 与 `Codex` 都能承载这条 Memory 闭环。

完成标志：

- `Claude Code` 跑通全链路
- `Codex` 跑通全链路
- host install 与 doctor 能支撑阶段验证

### M5：阶段验收

目标：团队对“Memory 是主目标，宿主是承载面”形成一致认知。

完成标志：

- 团队对阶段边界、未完成项、后续演进方向达成一致
- 文档、讨论和排期都不再把“多宿主”误当成阶段主题

---

## 明确不做

为了保证这个阶段能真正落地，以下内容不作为本阶段承诺交付：

- 基于用户意图的预先查找正式功能
- MCP 形态的完整接入
- 云端 SaaS 存储正式上线
- 更多宿主扩展
- 复杂的自动召回策略优化
- 面向最终商业化的权限、计费、配额体系

---

## 探索项

下面这些内容在本阶段可以调研、预留接口、做小范围验证，但不作为验收门槛：

### 1. 基于用户意图的预先查找

理想状态下，Corivo 在用户提交 prompt 的第一时间，就能基于用户意图做一轮预查找，为后续 skill 调用提供更快结果。

这个方向有价值，但本阶段只做两件事：

- 在 hooks 与 query 层预留扩展点
- 为未来的预取缓存设计输入输出边界

### 2. 存储后端替换能力

本阶段先以本地 DB 跑通闭环，但会保留未来切换到 SaaS 存储与向量服务的边界。

探索重点是：

- 抽象设计是否足够稳定
- 哪些接口必须同步，哪些可以异步
- SaaS 化后哪些状态仍需本地保留

---

## 主要风险与依赖

### 1. 宿主能力并不完全对称

`Claude Code` 和 `Codex` 在 hooks、instructions、notify、技能注入能力上并不完全一致。阶段目标应追求“闭环效果一致”，而不是强行要求实现机制完全相同。

### 2. 实时 hooks 不能影响主对话体验

如果 hooks 执行过重、失败不可控、或注入链路不稳定，会直接伤害宿主体验。必须保证：

- 原文写入可快速完成
- 摘要流程异步化
- 注入失败时可静默降级

### 3. Markdown 与 DB 的双层模型容易混乱

如果团队没有统一认知，容易出现：

- 把 Markdown 当数据库使用
- 把 DB 查询与摘要查询混成一层

本阶段必须明确：

- DB 保存原文与处理状态
- Markdown 保存可读的索引与摘要

### 4. 存储抽象如果过早过重，会拖慢主线

DB 可插拔是必须考虑的方向，但这阶段不应该因为“未来可能接 SaaS”而过度设计。原则应是：

- 先把接口边界做对
- 当前实现仍以本地 SQLite 为第一优先级

---

## 对团队的最终对齐口径

这个阶段不是在做“插件安装”“历史导入”“Markdown 摘要”“技能查询”四个分散功能，而是在做 Corivo 的第一条 Memory 生成与召回闭环。

`Claude Code` 和 `Codex` 只是这条闭环的两个验证宿主。真正的阶段主目标，是让 Corivo 先成为一个能沉淀 Memory、并在后续对话里把记忆重新召回出来的系统。
