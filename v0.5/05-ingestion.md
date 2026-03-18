# 05 · 自动采集

> Corivo 设计文档 v1.0 · [返回索引](./README.md)

---

## 定位

采集是 Corivo 核心流程的第一步。没有采集，记忆层就是空的。Corivo 的目标是从用户已有的工作流中自动获取信息，不需要用户改变任何习惯。

---

## 两种采集模式

### 模式一：规则注入（首选）

不是 Corivo 去监听工具，而是**让工具主动使用 Corivo**。

`corivo init` 时向 CLAUDE.md / agent.md / .cursorrules 注入一段规则。AI 工具读到规则后，在工作过程中自动调用 `corivo save` 存储信息、`corivo query` 查询记忆。

注入后的效果：零额外进程、零监听，AI 工具自己就是采集器和查询端。

注入规则模板（以 CLAUDE.md 为例）：

```markdown
## Corivo 记忆层

你有一个外部记忆工具 Corivo，通过 CLI 调用。

### 查询
- 开始新任务前，先调用 `corivo query` 查询相关记忆（历史决策、偏好、教训）
- 用户提问涉及历史信息时，先查 Corivo

### 存储
- 对话中出现重要决策、结论时，调用 `corivo save` 存储
- 用户表达偏好或规则时，存为指令类 block
- 遇到经验教训时，存为知识类 block

### 更新
- 查询到的记忆与当前信息矛盾时，调用 `corivo update` 更新
- 提醒用户时标注 [corivo]，让用户知道信息来源
```

适配格式：CLAUDE.md（Claude Code）、agent.md（Codex）、.cursorrules（Cursor）、AGENTS.md（Copilot）。

### 模式二：被动采集（补充）

对于不支持规则注入的场景（ChatGPT Web、飞书消息流），Corivo 主动采集。

```
数据源 ──→ 采集器 ──→ corivo save (pending) ──→ Ingestion Agent 异步标注
```

采集器只做一件事：把原始内容写入 pending block。标注和整理交给心跳引擎异步完成。

---

## 采集策略：全量进入，后台淘汰

采集阶段不做价值判断。所有信息先全量写入 pending block（vitality 100），后续由记忆生命周期机制自然淘汰低价值内容。

宁可多采不可遗漏。后台的衰减和整合会在几天内把噪音降温。

---

## 数据源

### AI 对话

**实时路径**：AI 工具通过注入规则或 MCP 主动调用 `corivo save`。覆盖 Claude Code、Cursor 等已接入的工具。

**批量导入**：对于未接入的工具（如 ChatGPT Web），用户导出对话历史后通过 CLI 导入。

```bash
corivo ingest --source chatgpt --file export.json
```

### 消息平台

**实时路径**：飞书使用长连接接收消息事件，Slack 使用 Events API。复用 IM Bridge 的 bot 基础设施。只采集用户参与的对话。

**批量导入**：新用户冷启动时可导入历史消息。

```bash
corivo ingest --source feishu --token xxx --days 30
```

### 本地 Agent 配置文件

扫描用户项目目录中的 CLAUDE.md、agent.md、.cursorrules 等文件。这些是用户已整理好的高质量上下文——项目规范、代码风格、技术偏好。

```bash
corivo ingest --source local-configs --scan ~/Projects
corivo ingest --source local-configs --watch ~/Projects  # 持续监听变化
```

跨项目整合价值：发现多个项目共享的规则 → 提炼为全局偏好；发现矛盾 → 推送提醒；新项目 → 基于全局偏好自动初始化。

---

## Ingestion Agent

心跳引擎中的最高优先级任务（详见 06-heartbeat.md），定期扫描 `annotation = "pending"` 的 block，逐条处理：

**过滤**：纯表情、系统通知、"好的/收到"等无信息量内容 → 归档（annotation 改为 `noise · archived`）。宽松过滤，宁可放过。

**切分**：一条 pending block 含多个独立信息点 → 原 block 归档，生成多个新 block，`consolidated_from` 保留溯源。

**标注**：补全双维度 annotation——判断性质（事实/知识/决策/指令）+ 领域（self/people/project/area/asset/knowledge）+ 具体标签。

**去重**：与已有完成态 block 对比——完全重复则归档，更新版本则触发重构，部分重叠则保留并 refs 关联。

---

## 采集来源标识

block 的 `source` 字段记录数据来源：

| source | 说明 |
|--------|------|
| `manual` | 用户或 Agent 手动写入 |
| `claude-inject` | Claude Code 通过注入规则主动存储 |
| `cursor-inject` | Cursor 通过注入规则主动存储 |
| `codex-inject` | Codex 通过注入规则主动存储 |
| `claude-mcp` | 通过 MCP Server 实时采集 |
| `chatgpt-import` | ChatGPT 对话历史导入 |
| `local-config` | 本地配置文件采集 |
| `feishu:{group-id}` | 飞书消息采集 |
| `slack:{channel-id}` | Slack 消息采集 |

用于去重、溯源、采集源管理。

---

## 透明度与隐私

### 两种告知方式

**监听类采集（消息流、文件监听）**：安装引导时一次性说明，用户确认后安静运行。类比 App 的麦克风权限——授权一次，之后不反复打扰。

```
$ corivo init

Corivo 会在后台监听以下数据源，帮你自动记住重要信息：
  · 飞书/Slack 消息 — 你参与的对话中的关键信息
  · 本地项目文件 — CLAUDE.md 等配置文件的变化
  · AI 对话 — 通过 MCP 接入的对话内容

所有数据只存在你的本地设备上，不上传到任何服务器。
确认启用？(y/n)
```

**配置文件注入（修改 CLAUDE.md 等）**：逐个文件申请授权。类比 App 请求修改你的文件——每个文件单独确认，展示注入内容，用户自主选择。注入后 AI 工具每次存储在对话中标注 `[corivo] 已记录：...`。

| | 监听 | 配置文件注入 |
|--|------|-------------|
| 本质 | Corivo 自己的行为 | 修改其他工具的行为 |
| 告知 | 安装引导时一次性说明 | 逐个文件申请授权 |
| 用户感知 | 安装后安静运行 | 每次记录在对话中可见 |
| 关闭 | `corivo sources off xxx` | `corivo eject` |

### 用户控制

```bash
corivo sources              # 查看所有采集源状态和今日记录数
corivo log --today          # 查看今天记了什么
corivo sources off feishu   # 关闭某个监听源
corivo sources pause        # 一键暂停所有采集
corivo eject                # 移除所有注入规则
corivo eject --file <path>  # 移除单个文件的注入
corivo delete blk_xxx       # 删除某条记录
```

### 隐私底线

- 只采集用户自己参与的对话
- 所有数据只存在用户本地设备上
- AI 工具通过注入规则存储时，在对话中标注 `[corivo] 已记录：...`
- 每个采集源独立开关，暂停和退出随时可用
- IM bot 在自我介绍中注明采集行为

---

## 设计决策

**为什么规则注入是首选？** 成本最低——一段文本写入已有文件。而且 AI 工具不只被动被采集，而是主动使用 Corivo 的全部能力。采集和查询在同一个动作里完成。

**为什么全量采集？** 实时判断价值需要每条消息调 LLM，成本高、易误判。全量进入 + 后台淘汰，采集零成本，筛选交给记忆生命周期机制。

**为什么不要独立消息队列？** pending block 就是队列。一张表、一种结构，架构最简。噪音不删除只归档，符合数据永不删除原则。
