# Corivo CLI 去巨石化与分层收敛方案

## 状态

Draft

## 执行基线

这份文档当前作为 `packages/cli` 分层治理的 governing spec 使用。

首个可落地里程碑是 **Phase 1**：

- 统一唯一有效的分层语言
- 发布层职责与 freeze 规则
- 为后续迁移建立测试与 lint 级别的工程约束

在 Phase 1 完成之前，不应启动大爆炸式搬家，也不应开始 package 级拆分。

## 背景

`packages/cli` 是 Corivo 当前最核心的 package，但它已经同时承担了过多职责：

- CLI 命令入口与输出
- 本地数据库与搜索
- memory domain 规则与模型
- heartbeat / daemon / scheduling
- host install / doctor / import
- push / suggestion / reminder
- cold scan / identity / ingestion
- update / bootstrap / TUI

与此同时，仓库文档已经开始采用更成熟的分层语言：

- `cli/`
- `application/`
- `domain/`
- `infrastructure/`
- `runtime/`

但在实际代码中，仍存在大量历史目录并继续承载新逻辑：

- `engine/`
- `service/`
- `storage/`
- `hosts/`
- `models/`
- `type/`
- `utils/`
- 以及多组按 feature 平铺的顶层目录

这造成了两个并存的问题：

1. **包内边界不清**：文档中的分层尚未成为代码中的唯一结构语言
2. **包级复杂度集中**：`packages/cli` 已经成为事实上的隐性巨石包

本方案不是单纯的目录整理方案，而是一个**去巨石化 + 分层收敛**方案。

---

## 问题定义

### 1. 双重地图问题

当前仓库同时存在两套架构描述：

- 文档中的目标分层
- 代码中的混合现实结构

结果是：

- 新代码放置位置不稳定
- 代码评审标准难统一
- 外部贡献者难以上手
- 文档中的边界无法被代码兑现

### 2. CLI 隐性巨石问题

即使只看 `packages/cli` 内部，也已经能看到高度集中化的复杂度。  
如果本次工作只做目录分层，而不处理包级职责膨胀，最终只会得到：

- 更整齐的目录树
- 但仍然过重的核心包
- 更高的发布、测试、变更耦合成本

因此，本次工作必须同时回答两个问题：

- **代码应该放在哪一层？**
- **哪些能力不应继续留在 CLI 包内？**

---

## 目标

### 短期目标

在 `packages/cli` 内建立清晰、可执行的层职责：

- `cli`
- `application`
- `domain`
- `infrastructure`
- `runtime`

并冻结历史桶目录的新增行为。

### 中期目标

将已经稳定、非 CLI 专属的核心能力逐步从 `packages/cli` 中外提，使 CLI 包收敛为：

- 命令行适配层
- composition root
- CLI 专属 UX 逻辑

而不是继续承担所有产品核心实现。

### 非目标

本方案不追求：

- 一次性移动所有文件
- 一次性拆出大量新 packages
- 在没有边界规则时做大规模搬家
- 为了形式整洁打断当前可运行状态

---

## 核心原则

### 1. 先收敛语言，再收敛代码

先明确一套唯一有效的架构语言，再逐步迁移代码。  
不再允许文档和代码各说各话。

### 2. 先控制增量，再处理存量

遗留目录必须先 freeze。  
否则迁移期间旧结构会继续增长，永远无法收口。

### 3. 先包内分层，再包级拆分

不要在内部边界仍不稳定时同时进行大规模拆包。  
先让 `packages/cli` 成为一个“边界清晰的巨石”，再逐步外提稳定能力。

### 4. 拆包只拆稳定、高内聚、非 CLI 专属能力

拆包不是目的。  
真正值得拆出的，是：

- 边界稳定
- 可独立测试
- 不依赖 CLI 语义
- 可被多个入口复用

的模块。

### 5. 依赖方向比目录命名更重要

优先保证层之间依赖方向正确，其次才是目录名字是否理想。

---

## 目标层结构

`packages/cli/src` 的目标结构定义为：

```text
src/
  cli/
  application/
  domain/
  infrastructure/
  runtime/
  memory-pipeline/
```

其中 `memory-pipeline/` 暂时保留为一级子系统目录，但它不能成为新的杂项容器，后续也必须遵守清晰边界。

---

## 层职责定义

### `cli/`

职责：

- 命令定义
- 参数解析
- 调用 application use case
- 呈现输出
- 映射 exit code

不负责：

- 业务规则
- 持久化实现
- daemon loop
- host 安装实现
- provider 细节

判断标准：

> 如果它的存在是为了“让命令行工作”，它属于 `cli/`。

---

### `application/`

职责：

- 用例编排
- 一次动作的执行流程
- domain 与 infrastructure 的组织和拼装
- 输入 / 输出 DTO
- 错误映射与顺序控制

不负责：

- 纯业务规则
- CLI 输出
- 底层技术实现
- 长生命周期调度

判断标准：

> 如果它回答的是“这个动作如何完成”，它属于 `application/`。

---

### `domain/`

职责：

- Corivo 核心业务概念
- 业务模型
- 业务规则
- 纯逻辑服务
- 稳定契约

不负责：

- SQLite
- 文件系统
- shell / CLI
- launchd/systemd
- provider SDK
- 具体平台适配

判断标准：

> 如果脱离 terminal / db / fs / network 仍然成立，它优先属于 `domain/`。

---

### `infrastructure/`

职责：

- SQLite
- schema / migration / repository / search
- filesystem
- host installer / importer / adapter
- config / env / platform integration
- output-side persistence
- provider adapters

不负责：

- 核心业务规则
- CLI 参数解析
- 后台循环控制

判断标准：

> 如果它绑定了某种具体技术实现，它属于 `infrastructure/`。

---

### `runtime/`

职责：

- daemon lifecycle
- scheduler
- heartbeat orchestration
- auto-sync loop
- process coordination
- background runtime policy glue

不负责：

- 纯业务规则
- CLI 输出
- 底层 DB 实现

判断标准：

> 如果它回答的是“何时执行、如何持续运行、如何循环”，它属于 `runtime/`。

---

## 依赖方向

推荐依赖方向如下：

```text
cli -> application -> domain
application -> infrastructure
runtime -> application / domain / infrastructure
infrastructure -> domain
domain -> 无外层依赖
```

明确禁止：

- `domain -> infrastructure`
- `domain -> cli`
- `domain -> runtime`
- `application -> cli`
- `application -> runtime`
- `infrastructure -> cli`

---

## 现有目录处理策略

### 保留并强化

以下目录保留为目标结构的一部分：

- `cli/`
- `application/`
- `domain/`
- `infrastructure/`
- `runtime/`

### 暂时保留但受控

- `memory-pipeline/`

要求：

- 明确其内部边界
- 不允许成为兜底目录
- 后续视成熟度再决定是否进一步拆入全局层结构或保持子系统边界

### 冻结新增并逐步迁移

以下目录进入 **freeze** 状态：

- `engine/`
- `service/`
- `storage/`
- `hosts/`
- `models/`
- `type/`

freeze 的定义是：

- 允许 bugfix
- 允许纯迁移修改
- 不允许新增功能代码
- 不允许把新的职责继续放进去

执行要求补充：

- freeze 目录中的新增逻辑必须视为违规
- 如果某次迁移需要短期 compatibility shim，该 shim 必须在同一任务或紧随其后的 cleanup 中移除
- 代码评审与自动化检查都应将 freeze 目录视为“仅减不增”

---

## 目录映射规则

### `engine/`

迁移规则：

- 规则类逻辑 -> `domain/`
- 用例编排 -> `application/`
- heartbeat / scheduler / loop -> `runtime/`

### `service/`

迁移规则：

- 业务服务 -> `domain/`
- 用例服务 -> `application/`
- 外部集成服务 -> `infrastructure/`

### `storage/`

迁移规则：

- repository -> `infrastructure/storage/repositories`
- schema -> `infrastructure/storage/schema`
- search -> `infrastructure/storage/search`
- lifecycle / db facade -> `infrastructure/storage/lifecycle`

### `hosts/`

迁移规则：

- contracts -> `domain/host/contracts`
- installers / importers / adapters -> `infrastructure/hosts/*`
- install / doctor / uninstall / import orchestration -> `application/hosts/*`

### `models/`

迁移规则：

- 业务模型 -> `domain/.../models`
- adapter DTO -> 就近放置

### `type/`

迁移规则：

- 业务相关类型 -> 跟随业务模块
- 技术适配类型 -> 跟随适配器模块
- truly shared 基础类型 -> 仅在必要时进入 `shared`

---

## feature 顶层目录的处理原则

以下目录不应长期与分层目录并列作为一级顶层分类：

- `identity/`
- `push/`
- `raw-memory/`
- `cold-scan/`
- `update/`
- `first-push/`
- `ingestors/`

这些目录应按职责拆回分层结构。

### 示例：`identity`

- 身份模型 / 规则 -> `domain/identity`
- 身份用例 -> `application/identity`
- 平台指纹 / 持久化 -> `infrastructure/*`

### 示例：`push`

- 推送策略 -> `domain/*`
- 推送生成用例 -> `application/*`
- push queue persistence -> `infrastructure/output`
- 后台触发 -> `runtime/*`

### 示例：`cold-scan`

- 提取逻辑抽象 -> `application` / `domain`
- 本地系统读取实现 -> `infrastructure`
- 触发与调度 -> `application` 或 `runtime`

---

## 为什么不能只做包内目录分层

如果本次工作只把 `packages/cli/src` 改成：

- `application`
- `domain`
- `infrastructure`
- `runtime`

但不处理包级职责问题，那么：

1. 核心复杂度仍集中在 CLI 包内
2. CLI 发布与核心逻辑发布继续强耦合
3. 测试与变更影响面持续过大
4. 后台运行时与核心领域逻辑无法独立复用
5. `packages/cli` 仍然是事实上的产品总装箱

因此，本次方案必须明确采用双层目标：

- **短期：** 在 CLI 包内完成清晰分层
- **中期：** 将稳定核心能力从 CLI 包中逐步外提

---

## `packages/cli` 的未来职责定义

未来的 `packages/cli` 应收敛为：

- 命令行入口
- 参数与终端输出适配
- composition root
- 少量 CLI 专属 UX 逻辑

未来的 `packages/cli` 不应继续作为以下能力的唯一宿主：

- memory 核心模型与规则
- SQLite 存储实现
- daemon / heartbeat runtime
- host capability contracts
- host integration 基础设施实现

---

## 中期拆包方向

以下能力是优先级较高的拆包候选。

### 1. Storage

候选职责：

- SQLite repositories
- schema / migrations
- search backend
- db lifecycle

候选包名：

- `@corivo/storage-sqlite`
或
- `packages/storage`

原因：

- 明显是基础设施能力
- CLI 只是消费者
- 边界天然清晰

### 2. Memory Core

候选职责：

- Block / Association / Pattern
- annotation / vitality / association rules
- recall / scoring / dedupe policy

候选包名：

- `@corivo/memory-core`
或
- `packages/core`

原因：

- 这是产品核心，不是 CLI 特有能力

### 3. Runtime

候选职责：

- heartbeat
- daemon lifecycle
- scheduling
- background coordination

候选包名：

- `@corivo/memory-runtime`
或
- `packages/runtime`

原因：

- 长生命周期流程不应绑定 CLI 包

### 4. Host Core / Integrations

候选职责：

- host capability contracts
- host orchestration contracts
- installers / importers / adapters

候选包名：

- `@corivo/host-core`
- `@corivo/hosts`
或继续在 `packages/hosts/*` 体系演化

原因：

- 宿主集成不应在长期完全耦合于 CLI 核心实现

---

## 拆包判断标准

一个模块适合外提为 package，通常应满足以下多数条件：

1. 不是 CLI 专属
2. 有稳定接口
3. 可以独立测试
4. 被多个子系统依赖
5. 技术边界清晰
6. 变更节奏与 CLI 不一致

不满足这些条件的模块，不应为了“看起来更模块化”而提前拆包。

---

## 分阶段执行策略

### Phase 1：建立唯一有效的层语义

目标：

- 统一架构语言
- 冻结遗留目录
- 阻止新代码继续流入旧结构

动作：

- 发布本方案文档
- 在 `packages/cli/README.md` 或 architecture 文档中明确新代码落点规则
- 代码评审中禁止向 freeze 目录新增功能代码

产出：

- 新增代码路径有统一答案
- 遗留目录停止增长

---

### Phase 2：清理桶目录，完成包内收敛

优先处理：

1. `storage/`
2. `hosts/`
3. `service/`
4. `engine/`
5. `models/` / `type/`

策略：

- 每次迁移只处理一类语义
- 小步提交，不做大爆炸式搬家
- 保持运行与测试持续可验证

产出：

- `packages/cli` 成为一个边界清晰的分层巨石

---

### Phase 3：识别并外提稳定核心能力

优先候选：

1. storage
2. memory core
3. runtime
4. host core / integrations

策略：

- 只拆已稳定边界
- 先建立 package contract，再移动实现
- 保持 CLI 作为 composition root

产出：

- `packages/cli` 开始缩身
- 核心复杂度从 CLI 包中释放

---

### Phase 4：CLI 薄壳化

最终目标：

- `packages/cli` 只保留 command adapter、composition root、CLI UX
- 核心逻辑由独立包承载
- CLI 变成产品入口而不是产品本体

---

## 约束机制

仅靠文档不够，必须有工程约束。

### 1. Import boundaries

加入 ESLint 或其他边界检查规则：

- `domain/**` 不得依赖 `infrastructure/**`
- `domain/**` 不得依赖 `cli/**`
- `application/**` 不得依赖 `cli/**`
- `application/**` 不得依赖 `runtime/**`
- `infrastructure/**` 不得依赖 `cli/**`

### 2. 目录级 README

为以下目录增加短 README：

- `application/`
- `domain/`
- `infrastructure/`
- `runtime/`

说明：

- 负责什么
- 不负责什么
- 典型模块示例
- 常见误放案例

### 3. PR checklist

新增检查项：

- 本次改动是否向 freeze 目录新增了功能代码？
- 是否新增了反向依赖？
- 是否创建了新的横切桶目录？
- 是否把 feature 逻辑错误地提升为顶层目录？

---

## 成功标准

本次收敛是否成功，不看“移动了多少文件”，而看：

1. 新代码是否只进入目标分层目录
2. 遗留目录是否停止扩张
3. `domain` 是否保持纯净，不再反向依赖基础设施
4. `packages/cli` 是否开始从“总装箱”转为“组合根”
5. 文档中的架构图是否终于与代码现实一致

---

## 最终结论

本次工作不应被理解为一次目录整理，而应被理解为一次**架构边界治理**。

短期内，我们的目标不是立刻消灭 `packages/cli`，而是先让它成为一个边界清晰、依赖方向正确的分层巨石。  
中期内，我们再将已稳定的核心能力逐步外提，使 CLI 包收敛为命令行入口与组合根，而不再承担所有核心实现。

换句话说：

> **先让 CLI 变得有层次，再让 CLI 变薄。**
