# 06 · 心跳引擎

> Corivo 设计文档 v0.5 · [返回索引](./README.md)

---

## 定位

心跳是 Corivo 核心流程的第二步——连接采集和推送的桥梁。没有心跳，采集进来的是未处理的 pending block，推送出去的也无从谈起。

心跳是 Corivo 的新陈代谢。停了，数字孪生就停止成长。

---

## v0.5 更新：守护进程策略

**问题**：v0.2 的"寄生策略"依赖已有常驻进程。如果用户：
- 只用 CLI，不用 MCP/IM Bridge
- Claude Code 只在需要时打开
- 没有其他常驻进程

心跳就无法稳定运行。

**v0.5 解决方案**：提供两种模式

### 模式一：寄生模式（默认）

心跳寄生在 Corivo 已有的常驻接入点上。零新进程。

```
┌──────── 用户已有的常驻进程 ────────┐
│                                    │
│  MCP Server    IM Bridge    serve  │
│                                    │
└─────┬──────────┬─────────┬────────┘
      └──────────┴─────────┘
                 │
      ┌──────────▼──────────┐
      │   Heartbeat Loop    │
      │   (统一维护循环)      │
      └──────────┬──────────┘
```

### 模式二：守护进程模式（可选）

用户可以选择启动独立守护进程，通过系统服务管理：

```bash
corivo daemon start    # 启动守护进程
corivo daemon status   # 查看状态
corivo daemon stop     # 停止
corivo daemon enable   # 开机自启（macOS launchd / Windows Task Scheduler）
```

**实现**：
- macOS: `~/Library/LaunchAgents/com.corivo.daemon.plist`
- Linux: systemd user service
- Windows: Task Scheduler task

**自动切换逻辑**：如果没有检测到任何常驻接入点，且守护进程未运行，CLI 会在首次执行时询问是否启动守护进程。

---

## 六个任务（按优先级）

### 1. 标注 pending block · 最高

每次循环先扫描 `annotation = "pending"` 的 block，调 LLM 做过滤/切分/标注/去重（详见 05-ingestion.md）。每次最多处理 10 条。

最高优先级，因为 pending block 无法被查询——用户问了相关问题，如果信息还卡在 pending 状态，等于不存在。

### 2. **提取决策模式 · 高**（v0.5 新增）

扫描 `annotation = 决策 · *` 且 `pattern = null` 的 block，调用 Pattern Extraction Agent 提取决策模式。

每次最多处理 5 条。模式提取是预测能力的基础，优先级高于普通整合。

### 3. 重构 · 中高

Agent 查询返回 block 后，该 block 被标记为"待审视"。心跳循环对其评估准确性、检查矛盾、更新 annotation。每次最多审视 5 个。

### 4. 热区整合 · 中

每次循环扫描 `status = active` 的 block（按 `updated_at` 从新到旧，最多 20 个），执行去重、补链、提炼。

### 5. vitality 衰减 · 定时

每 24 小时执行一次。遍历所有非 archived 的 block，按 annotation 类型应用差异化衰减系数，降级 vitality 低于阈值的 block。纯本地数值计算，毫秒级完成。

### 6. 温区/冷区整合 · 低

温区每日一次，冷区每周一次。逻辑同热区整合，扫描范围更大、频率更低。

---

## 心跳频率

| 接入点 | 间隔 | 说明 |
|--------|------|------|
| MCP Server | 30 秒 | 等待 Agent 调用的空闲期 |
| IM Bridge | 60 秒 | 等待 IM 消息的空闲期 |
| `corivo serve` | 30 秒 | 用户手动启动的独立模式 |
| **守护进程** | **30 秒** | **v0.5 新增：独立运行** |
| CLI 单次调用 | 调用时一次 | `query` 或 `save` 结束后顺便一轮 |

每次循环总执行时间控制在 **5 秒以内**。超时任务中断，下次继续。

---

## v0.5 新增：Pattern Extraction Agent

**职责**：从决策类 block 中提取决策模式，填充 `pattern` 字段。

**触发时机**：
1. 决策类 block 从 pending 转为完成态后
2. 用户通过 `corivo train` 主动添加训练数据时

**Prompt 模板**：

```
你是一个决策分析专家。请从以下决策记录中提取决策模式：

{block.content}

请分析：
1. 这是什么类型的决策？（技术选型/架构决策/产品方向/沟通策略/其他）
2. 决策考虑了哪些维度？每个维度的权重是多少（0-1）？
3. 最终决定是什么？
4. 被拒绝的选项有哪些？（如果能推断）
5. 这个决策适用于什么情境？

输出 JSON 格式。
```

**输出示例**：

```json
{
  "type": "技术选型",
  "dimensions": [
    {"name": "安全性", "weight": 0.9, "reason": "处理用户敏感数据"},
    {"name": "本地优先", "weight": 0.8, "reason": "离线场景需求"}
  ],
  "decision": "SQLCipher",
  "alternatives_rejected": ["MongoDB", "PostgreSQL"],
  "context_tags": ["移动端", "E2EE"],
  "confidence": 0.85
}
```

---

## LLM 调用策略

标注、模式提取、重构、整合四个任务需要 LLM。

**本地优先**：Ollama + Qwen/Llama 等本地模型。延迟低、无网络依赖、数据不出设备。

**API 备选**：用户自己的 API Key（Claude API / OpenAI API）。Corivo 不代管密钥。

**无 LLM 降级**：跳过需要 LLM 的任务，只执行衰减和 status 降级。pending block 积压，等配置 LLM 后再处理。

```bash
corivo config set llm.provider ollama
corivo config set llm.model qwen2.5:7b
# 或
corivo config set llm.provider anthropic
corivo config set llm.api_key sk-ant-xxx
```

---

## 设计决策

**为什么 v0.5 新增守护进程模式？** 寄生策略在理想状态下优雅，但现实中用户的工作流差异大。提供可选的守护进程，让 Corivo 在任何环境下都能稳定运行。

**为什么模式提取优先级高于普通整合？** 模式是 v0.5 的核心能力——预测的基础。没有模式，Corivo 只是记忆层；有模式，才是数字孪生。

**为什么按优先级而非时间表？** 时间表在空闲时浪费资源，忙碌时堆积任务。优先级调度在 5 秒窗口内先做最重要的事。

**为什么限制批量大小？** 500 条 pending block 一次处理完可能跑几分钟，阻塞响应。分散到多次循环，每次快速完成。
