# 06 · 心跳引擎

> Corivo 设计文档 v1.0 · [返回索引](./README.md)

---

## 定位

心跳是 Corivo 核心流程的第二步——连接采集和推送的桥梁。没有心跳，采集进来的是未处理的 pending block，推送出去的也无从谈起。

心跳是 Corivo 的新陈代谢。停了，记忆层就是死的。

---

## 核心原则：不引入新进程

心跳寄生在 Corivo 已有的常驻接入点上。哪个接入点在跑，哪个就承载心跳。用户不需要额外安装或启动任何东西。

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
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
  Ingest    Consolidate    Decay
```

MCP Server、IM Bridge、`corivo serve` 三个接入点共享同一套心跳逻辑。通过文件锁（`~/.corivo/heartbeat.lock`）保证同一时间只有一个实例执行心跳，其他实例专注接入职责。

---

## 五个任务（按优先级）

### 1. 标注 pending block · 最高

每次循环先扫描 `annotation = "pending"` 的 block，调 LLM 做过滤/切分/标注/去重（详见 05-ingestion.md）。每次最多处理 10 条。

最高优先级，因为 pending block 无法被查询——用户问了相关问题，如果信息还卡在 pending 状态，等于不存在。

### 2. 重构 · 高

Agent 查询返回 block 后，该 block 被标记为"待审视"。心跳循环对其评估准确性、检查矛盾、更新 annotation。每次最多审视 5 个。

第二优先级，因为用户刚看过的 block 最容易暴露过时问题。

### 3. 热区整合 · 中

每次循环扫描 `status = active` 的 block（按 `updated_at` 从新到旧，最多 20 个），执行去重、补链、提炼。

### 4. vitality 衰减 · 定时

每 24 小时执行一次。遍历所有非 archived 的 block，按 annotation 类型应用差异化衰减系数，降级 vitality 低于阈值的 block。纯本地数值计算，毫秒级完成。

### 5. 温区/冷区整合 · 低

温区每日一次，冷区每周一次。逻辑同热区整合，扫描范围更大、频率更低。

---

## 心跳频率

| 接入点 | 间隔 | 说明 |
|--------|------|------|
| MCP Server | 30 秒 | 等待 Agent 调用的空闲期 |
| IM Bridge | 60 秒 | 等待 IM 消息的空闲期 |
| `corivo serve` | 30 秒 | 用户手动启动的独立模式 |
| CLI 单次调用 | 调用时一次 | `query` 或 `save` 结束后顺便一轮 |

每次循环总执行时间控制在 **5 秒以内**。超时任务中断，下次继续。不阻塞接入点的正常工作。

---

## LLM 调用策略

标注、重构、整合三个任务需要 LLM。

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

**为什么不做独立 daemon？** Corivo 的目标是零新习惯。用户配了 MCP 或 IM Bridge，心跳就自动跑起来。不需要知道心跳的存在。

**为什么按优先级而非时间表？** 时间表在空闲时浪费资源，忙碌时堆积任务。优先级调度在 5 秒窗口内先做最重要的事。

**为什么限制批量大小？** 500 条 pending block 一次处理完可能跑几分钟，阻塞 MCP Server 响应。分散到多次循环，每次快速完成。
