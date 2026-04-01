# Corivo Memory Extraction And Merge Design

**日期**: 2026-04-02
**状态**: 提议中
**范围**: `packages/cli`

---

## 目标

定义一份独立于 memory pipeline framework 的执行方案 spec，把已经在本地手工验证有效的“两阶段记忆处理流程”工程化接入 Corivo。

这份文档要解决的是：

- 如何从数据库中的原文 session 记录提取 raw memories
- 如何把 raw memories 合并成 canonical final memories
- 如何同时支持全量初始化和增量更新
- 如何把已验证有效的 Phase 1 / Phase 2 prompt 作为核心机制资产保存下来
- 如何对外提供可调用入口，而不把触发时机写死在本模块里

这份文档不解决：

- 什么时候触发这套机制
- 谁来决定处理哪些 session
- heartbeat / command / runner 的调度策略
- recall 注入链路的最终宿主行为
- 新 memory type 的扩展设计

## 与现有 Framework 的关系

现有 [2026-04-01-memory-pipeline-framework-design.md](/Users/liuzhengyanshuo/workspace/yuanze/02%20研发管理/15-corivo/Corivo/docs/superpowers/specs/2026-04-01-memory-pipeline-framework-design.md) 解决的是“框架骨架”：

- pipeline / stage / artifact / runner 的分层
- detail layer 与 index layer 的边界
- init pipeline 与 scheduled pipeline 的总体结构

本文件补的是“记忆处理机制”：

- Phase 1 提取什么
- Phase 2 怎么合并
- 如何处理去重、覆盖、冲突、删除、过期
- Markdown 产物的正式 contract
- 对外可调用的处理入口

两份文档并存，职责如下：

- framework design 负责“流程骨架怎么挂起来”
- 本文负责“骨架里的记忆处理步骤到底怎么做”

## 设计原则

### 1. 正式输入来自数据库原文，不来自 session markdown 文件

手工验证阶段使用本地 `.md` session 文件，只是为了快速验证提示词与处理效果。

工程化后，正式输入必须来自数据库中的原文记录：

- 历史导入进入数据库后再处理
- 实时新聊天进入数据库后再处理

本模块不直接依赖本地 session `.md` 文件作为运行时输入。

### 2. 正式输出以 Markdown 为准

数据库承担：

- 原文存储
- 处理状态
- 处理中间索引或队列所需的辅助信息

但 canonical memory 的权威落点仍然是 Markdown：

- raw memory files
- final memory files
- `MEMORY.md` indexes

### 3. 保留 `raw -> final` 两层

工程化方案沿用手工验证中已经证明有效的两层结构：

- `raw`：按 session 产出的原始提取结果，用于审计、回放、重合并
- `final`：语义去重、冲突整合、范围修正后的 canonical memory

不采用“直接修改 final、没有 raw 中间层”的方案。

### 4. 模型主导语义判断，规则负责约束与兜底

模型负责：

- 判断是否值得记忆
- 判断属于哪种 memory type
- 判断两条记忆是否重复、覆盖、冲突或应并存
- 生成最终更完整、更少歧义的 canonical wording

规则负责：

- 固定 memory type taxonomy
- 明确排除项
- scope 的硬约束
- 敏感信息限制
- 时间归一化要求
- stale project memories 的清理原则

### 5. Prompt 是核心机制，不是可任意改写的实现细节

本设计中的 Phase 1 和 Phase 2 prompt 都来自已验证有效的手工流程。

工程实现允许：

- 把 prompt 拆成可复用片段
- 把 taxonomy / exclusions / output schema 独立成常量
- 用模板函数拼装 prompt

但不允许：

- 为了“代码更优雅”任意重写 prompt 语义
- 在没有重新验证效果前，大幅改动措辞与约束

### 6. 本模块定义“怎么处理”，不定义“何时触发”

本模块只定义：

- 输入 contract
- 输出 contract
- 处理步骤
- 可调用入口

本模块不定义：

- 何时运行
- 谁发起运行
- 如何重试
- 是否重复提交相同输入

这些属于上游编排层职责。

## 总体流程

统一流程如下：

```text
数据库原文 session 记录
  -> Phase 1: Raw Extraction
  -> raw memory files (按 session 一份)
  -> Phase 2: Final Merge
  -> final memory files + MEMORY.md indexes
```

两种上游场景共享同一套处理语义：

- `init/manual`：上游提交较大范围的 session 集合，适合初始化或人工重跑
- `scheduled`：上游提交较小范围的 session 集合，适合持续增量更新

本模块不关心这些集合是如何被挑出来的，只关心“给定一批 session，应如何正确处理它们”。

## 目录与产物结构

建议最终 memory 目录位于：

```text
~/.corivo/memory/
```

建议结构：

```text
~/.corivo/memory/
  raw/
    <session-id>.memories.md
  final/
    private/
      MEMORY.md
      *.md
    team/
      MEMORY.md
      *.md
```

说明：

- `raw/` 中每个 session 对应一份 raw extraction 结果
- `final/private/` 与 `final/team/` 是最终 canonical memories
- 类型不体现在目录层级中，只放在 frontmatter 中
- `MEMORY.md` 是轻量索引，也是 recall 的主要读取入口之一，但不承载完整 memory 内容

## Memory Type Taxonomy

第一版固定支持四类 memory：

```ts
export const MEMORY_TYPES = [
  'user',
  'feedback',
  'project',
  'reference',
] as const;
```

不在本设计中继续扩展第五类或第六类 memory。

### `user`

- 总是 `private`
- 用于记录用户角色、目标、偏好、知识背景
- 目标是让后续协作更贴合该用户

### `feedback`

- 默认 `private`
- 只有当它明确是项目级、团队级约束时才为 `team`
- 用于记录用户给出的工作方式反馈，包括纠正与确认过的有效做法

### `project`

- 可为 `private` 或 `team`
- 强烈偏向 `team`
- 用于记录当前项目中的目标、约束、上下文、原因、时点信息

### `reference`

- 通常为 `team`
- 用于记录外部信息源位置及其用途

## What Not To Save

以下内容不应进入记忆，即使用户明确要求“保存一下”也不应直接保存：

- Code patterns, conventions, architecture, file paths, or project structure
- Git history, recent changes, or who-changed-what
- Debugging solutions or fix recipes
- Anything already documented in CLAUDE.md files
- Ephemeral task details: in-progress work, temporary state, current conversation context

额外约束：

- `team` scope 的记忆中不能保存敏感信息
- 如遇 API key、凭据、口令等内容，必须排除

## Phase 1: Raw Extraction

### 目标

对单个完整 session 做一次记忆提取，产出该 session 对应的 raw memory extraction 结果文件。

### 输入单位

Phase 1 的基本处理单位固定为“一个完整 session”。

第一版不把“超长 session 切片提取”作为核心机制的一部分。后续如需优化，可在不改变语义 contract 的前提下增加切片策略。

### 输入

单个 session 的规范化原文记录，至少应包含：

- `sessionId`
- `messages`
- `host`
- `startedAt`
- `endedAt` 或上游可提供的顺序信息

本阶段不规定数据库 schema，只要求上游能把“一个完整 session 的消息内容”交给提取器。

### 输出

每个 session 产出一份 raw extraction 文件：

```text
raw/<session-id>.memories.md
```

### Raw Output Contract

raw 文件内容 contract 基本沿用手工验证版本：

- 每条 memory 使用一个 `<!-- FILE: ... -->` 注释声明目标路径
- 每条 memory 使用一个 fenced markdown block 表达
- block 内必须包含 frontmatter
- 若该 session 没有值得保存的 memory，文件内容必须是 `<!-- NO_MEMORIES -->`

示意格式：

````markdown
<!-- FILE: private/user_role_data_scientist.md -->
```markdown
---
name: User is a data scientist
description: User works as a data scientist and is currently focused on observability and logging
type: user
scope: private
source_session: session_001
---

User is a data scientist currently focused on observability and logging.
```
````

若无可提取内容：

```markdown
<!-- NO_MEMORIES -->
```

### Raw Extraction Rules

Phase 1 的提取规则与手工验证版保持一致：

- 只使用当前 session 的对话内容
- 不在提取阶段再去 grep 代码、读取文件、执行 git 命令做“验证”
- 如果用户明确要求记住某事，应直接按最合适类型提取
- 如果用户明确要求忘记某事，应产出 deletion marker
- 宁缺毋滥，优先少量高质量 memory

### Raw Memory Frontmatter

Raw memory block 的 frontmatter 至少包含：

- `name`
- `description`
- `type`
- `scope`
- `source_session`

### Deletion Marker

若 session 中出现明确的“忘记”请求，Phase 1 应记录删除标记，而不是直接修改 final memories。

删除语义来源于 raw 层，再由 Phase 2 真正生效。

本设计不强制 deletion marker 的唯一文本格式，但要求它在工程上可被稳定识别。推荐做法是：

- 保持 raw 文件仍使用 `<!-- FILE: ... -->` + fenced markdown block 结构
- 在 frontmatter 或正文中增加清晰的删除标记字段

### Phase 1 Prompt Asset

工程实现中的 Phase 1 prompt 应尽量保持与已验证版本一致。其核心要点包括：

- 读取给定的 session 对话
- 按四类 memory taxonomy 提取
- 严格遵守 exclusion list
- 产出 `<!-- FILE: ... -->` + fenced markdown block 的结果格式
- 无 memory 时输出 `<!-- NO_MEMORIES -->`

推荐工程化方式：

- 把 memory types taxonomy 独立成模块
- 把 exclusions section 独立成模块
- 把 output format section 独立成模块
- 用模板函数拼装完整 prompt

不推荐直接把 prompt 重写成另一套表达方式。

## Phase 2: Final Merge

### 目标

把 raw extraction 结果与已有 final memories 合并，维护一套全局一致的 canonical Markdown memory 集。

### 输入

Phase 2 的有效输入上下文由三部分组成：

- 新的 raw memories
- 当前已有的 final memories
- 必要的来源信息

必要来源信息至少包括：

- `source_session`
- session 时间顺序或可比较的新旧顺序信息
- 该 raw memory 的原始表述

### 输出

更新后的：

- `final/private/*.md`
- `final/team/*.md`
- `final/private/MEMORY.md`
- `final/team/MEMORY.md`

### Merge Semantics

Phase 2 需要处理以下语义：

#### 1. 语义去重

两条记忆即使文件名不同、措辞不同，只要表达的是同一事实或规则，也应视为重复。

应保留：

- 信息更完整的版本
- 更具体的版本
- 或更适合作为 canonical memory 的合并版本

#### 2. 演化覆盖

若一条较新的记忆表达的是对较旧记忆的自然演化，应保留较新、较准确、较完整的版本。

例如：

- 旧：用户正在探索 React
- 新：用户现在已经熟悉 React hooks

则应保留新版本，旧版本不再单独保留。

#### 3. 冲突整合

若两条记忆看似冲突，但实际反映的是不同条件下的偏好，应优先合并成更细致、条件更明确的 canonical memory，而不是简单二选一。

例如：

- 用户通常偏好小 PR
- 在大型重构里接受 bundled PR

优先结果应是更细致的综合表述，而不是机械保留两条彼此打架的规则。

#### 4. Scope 修正

合并时应重新检查 scope 是否正确：

- `user` 必须为 `private`
- `feedback` 默认 `private`
- 项目级硬约束才可升格为 `team`
- `project` 强烈偏向 `team`
- `reference` 通常为 `team`

#### 5. 排除项清理

如果 raw 中混入了不该保存的内容，Phase 2 必须继续作为第二道防线，把它清掉，而不是无条件接受 raw 输出。

#### 6. 删除标记生效

若 raw 中存在 deletion marker，Phase 2 应据此移除或失效相关 final memory。

#### 7. Stale Project Memory 清理

带绝对日期、明显已过期、且不再具有持续约束意义的 `project` memory 应在合并时被丢弃。

### Merge Result Preference

Phase 2 的判断由模型主导，但结果偏好应明确：

- 能合成为一条更完整、更少歧义的 memory 时，优先合成
- 只有当拆成多条更清晰时，才保留为多条

也就是说：

- 不机械追求“一定合成一条”
- 也不机械追求“冲突先并存再说”
- 目标是维护最清晰的 canonical memory set

### Final Memory Frontmatter

第一版 final memory frontmatter 至少包含：

- `name`
- `description`
- `type`
- `scope`
- `merged_from`

其中 `merged_from` 第一版只要求记录贡献该 final memory 的 `source_session` 列表。

### Phase 2 Prompt Asset

Phase 2 prompt 同样是核心机制资产，应尽量保持与手工验证版一致。其核心语义包括：

- 按语义而不是文件名去重
- 处理 evolving facts
- 显式整合 conflicts
- 修正 scope
- 删除 stale project memories
- 再次执行 exclusion rules
- 直接产出 final Markdown memories 与 `MEMORY.md`

Phase 2 的 prompt 也允许通过工程化方式拆分为：

- merge rules
- scope rules
- exclusion rules
- final output schema

但语义与措辞不应随意漂移。

## 增量更新语义

### 目标

在不重写整套处理机制的前提下，让这套方案从第一版开始就支持增量更新。

### 本文定义的增量

本文中“增量更新”的意思是：

- 上游给出一批待处理 session
- 本模块仅对这批 session 做 Phase 1 提取
- Phase 2 结合新 raw 与已有 final 结果，尽量只更新受影响的 final 文件

### 本文不定义的增量

本文不定义：

- 上游如何选出这批 session
- session 是否会被重复提交
- 何时把一个 session 视为“应重新处理”

这些仍属于上游职责。

### Incremental Final Update Policy

增量更新时应遵守：

- 尽量只改受影响的 final files
- 不强求最小 diff
- 只要求结果正确、结构清晰、实现可控

本设计不要求：

- 给每条 final memory 维护长期稳定身份
- 追踪单条 memory 的完整演化历史
- 使用稳定 ID 作为第一版的强制 requirement

### Global Correctness, Local Execution

Phase 2 维护的是一套全局一致的 canonical memory。

但在执行方式上：

- 不要求每次增量都全量重建全部 final memories
- 允许只更新受影响部分

判断标准是：

- 更新后的整体 final memory 集在语义上仍然正确
- 不因局部更新而引入重复、冲突或明显脏数据

## MEMORY.md Contract

每个 scope 目录下都保留一个 `MEMORY.md`：

- `final/private/MEMORY.md`
- `final/team/MEMORY.md`

其定位是：

- 轻量索引
- recall 的主要入口之一
- 不承载完整 memory 正文

格式约束：

```markdown
- [Title](filename.md) — one-line hook
```

要求：

- 一行一个条目
- 每行尽量小于约 150 字符
- 按语义主题组织，而不是按时间顺序
- 单个 index 控制在 200 行以内

## Prompt Assets

### 目标

把已验证有效的 prompt 视为正式设计资产，而不是“实现时再自由发挥”的说明性文字。

### 推荐组织方式

建议实现中按以下方式组织 prompt 资产：

- `memoryTypes.ts`
- `whatNotToSave.ts`
- `rawExtractionPrompt.ts`
- `finalMergePrompt.ts`

或等价结构。

### 工程化抽象约束

允许：

- 抽出 taxonomy
- 抽出 exclusions
- 抽出 frontmatter example
- 抽出 `MEMORY.md` index 规则
- 用模板函数按模式拼装 prompt

不允许：

- 为了减少代码重复而改变经过验证的行为约束
- 随意删除示例、scope guidance、body structure 要求
- 把 prompt 抽象到难以看出最终文本长什么样的程度

### Prompt Review Requirement

后续实现或迭代 prompt 时，应把“与本 spec 中已验证版本的偏差”作为明确 review 项，而不是默认接受 prompt 重写。

## 对外可调用入口

本模块应至少提供三类可调用能力：

### 1. Raw Extraction

职责：

- 输入一批 session 原文
- 对每个 session 执行 Phase 1
- 产出或更新对应 raw extraction files

建议语义：

```ts
extractRawMemories(inputSessions) -> raw extraction results
```

### 2. Final Merge

职责：

- 读取新的 raw memories
- 读取当前 final memories
- 执行 Phase 2
- 更新 final Markdown memories 和 `MEMORY.md`

建议语义：

```ts
mergeFinalMemories(rawInputs, currentFinalState) -> updated final state
```

### 3. Full Process

职责：

- 组合执行 Raw Extraction 与 Final Merge
- 对外提供单次完整记忆处理入口

建议语义：

```ts
processMemories(inputSessions) -> raw results + final updates
```

说明：

- 本文只定义这三类入口的职责边界
- 本文不定义它们由 CLI、heartbeat、daemon 或其他调用方中的哪一个触发

## 非目标

本设计明确不覆盖：

- 记忆处理的调度策略
- 上游如何选择处理范围
- recall 注入链路如何把 `MEMORY.md` 暴露给宿主
- 额外 memory type 的设计
- 单条 memory 的长期稳定 ID
- 单条 memory 的演化历史追踪
- 人工审阅 `MEMORY.md` 作为正式系统步骤

## 附录 A：Phase 1 Prompt Baseline

以下内容不是“灵感来源”，而是工程实现应尽量保持的 Phase 1 prompt 基线。后续实现允许把它拆成常量和模板，但不应在未重新验证前改变其核心语义、结构顺序和约束力度。

1. 输入是一段完整 session 对话
2. 仅使用该对话内容，不再向外验证
3. 按 `user / feedback / project / reference` 四类进行提取
4. 严格遵守排除项
5. 支持明确的 remember / forget 指令
6. 输出为 `<!-- FILE: ... -->` + fenced markdown block
7. 无 memory 时输出 `<!-- NO_MEMORIES -->`

手工验证版中关于 memory taxonomy、scope guidance、examples、what not to save、output format 的具体措辞，应尽量原样保留到工程实现中。

第一版实现应至少完整保留下列结构块：

- 开场角色定义：`You are acting as the memory extraction subagent`
- 明确禁止二次调查：`Do not attempt to investigate or verify that content further`
- `## Types of memory`
- `## What NOT to save in memory`
- `## Output format`
- remember / forget 指令处理

其中以下输出格式要求应视为规范性要求：

````text
For EACH memory worth saving, output a fenced markdown block with this exact structure:

<!-- FILE: {scope}/{filename}.md -->
```markdown
---
name: {memory name}
description: {one-line description}
type: {user, feedback, project, reference}
scope: {private, team}
source_session: {session filename}
---

{memory content}
```
````

以及：

```text
If a session has NO memories worth extracting, output exactly: <!-- NO_MEMORIES -->
```

## 附录 B：Phase 2 Prompt Baseline

以下内容同样不是“可自由发挥的 merge 说明”，而是工程实现应尽量保持的 Phase 2 prompt 基线。后续实现允许把 merge rules、scope rules、exclusion rules 拆成独立段落，但不应在未重新验证前改变其核心语义和优先级。

1. 读取 raw extraction files
2. 以语义而不是文件名去重
3. 保留更完整、更具体、更近期的版本
4. 对看似冲突的 memory 进行显式整合
5. 按四类 memory 的 scope guidance 修正 scope
6. 删除 stale project memories
7. 再次应用排除项
8. 直接生成 final Markdown memories 与 `MEMORY.md`

手工验证版中关于 dedup、evolving facts、conflict resolution、scope preservation、stale dropping、output writing 的具体措辞，应尽量原样保留到工程实现中。

第一版实现应至少完整保留下列 merge rule 组：

- `Dedup by semantics, not filenames`
- `Merge evolving facts`
- `Resolve conflicts explicitly`
- `Preserve scope correctly`
- `Drop stale project memories`
- `Respect the exclusion list`

其中以下输出目标应视为规范性要求：

```text
Write the final memory files directly to disk:

- Private memories -> memories/final/private/{filename}.md
- Team memories -> memories/final/team/{filename}.md
- Private index -> memories/final/private/MEMORY.md
- Team index -> memories/final/team/MEMORY.md
```

以及：

```text
Each MEMORY.md entry should be one line, under ~150 characters
Organize semantically by topic, not chronologically
Keep each index under 200 lines
```
