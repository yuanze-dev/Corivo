# 06 · 心跳引擎

> Corivo 设计文档 v0.10 · [返回索引](./README.md)

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

**v0.5/v0.10 解决方案**：提供两种模式

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

### 2. **提取决策模式 · 高**

扫描 `annotation = 决策 · *` 且 `pattern = null` 的 block，调用 **混合模式提取引擎**（详见 01-block.md）。

每次最多处理 5 条。模式提取是预测能力的基础，优先级高于普通整合。

**v0.10 更新：混合提取策略**

```javascript
// 伪代码：心跳循环中的模式提取
async function extractPendingPatterns(llmAvailable) {
  const pendingBlocks = await db.query(`
    SELECT * FROM blocks
    WHERE annotation LIKE '决策%'
      AND pattern IS NULL
      AND status != 'archived'
    ORDER BY created_at DESC
    LIMIT 5
  `)

  for (let block of pendingBlocks) {
    // Step 1: 先尝试规则引擎（<10ms）
    let pattern = ruleEngine.extract(block.content)

    if (pattern) {
      // Step 2: 如果有 LLM，验证规则结果
      if (llmAvailable && config.llm.verify_rule_results) {
        let verified = await llmService.verifyPattern(pattern, block.content)
        if (verified.confidence > 0.8) {
          pattern = { ...verified.pattern, pattern_source: "mixed" }
        }
      } else {
        pattern.pattern_source = "rule"
      }
    } else if (llmAvailable) {
      // Step 3: 规则不匹配，使用 LLM
      pattern = await llmService.extractPattern(block.content)
      pattern.pattern_source = "llm"
    }

    // 保存提取的 pattern
    if (pattern) {
      await db.update(block.id, { pattern: pattern })
    }

    // 时间控制：确保单次循环不超过 5 秒
    if (elapsed() > 4000) break
  }
}
```

**成本优化：**

- 规则引擎：零 LLM 调用，纯本地计算
- LLM 验证：仅验证规则结果，prompt 简短，成本低
- 完整 LLM：仅在规则不匹配时触发

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
| **守护进程** | **30 秒** | **独立运行** |
| CLI 单次调用 | 调用时一次 | `query` 或 `save` 结束后顺便一轮 |

每次循环总执行时间控制在 **5 秒以内**。超时任务中断，下次继续。

---

## v0.10 规则引擎设计

### 规则库结构

```
rules/
├── tech-choice.js      # 技术选型规则
├── communication.js    # 沟通风格规则
├── time-commitment.js  # 时间承诺规则
├── preference.js       # 偏好声明规则
└── framework.js        # 框架引擎
```

### 框架引擎

```javascript
// rules/framework.js
class RuleEngine {
  constructor() {
    this.rules = []
  }

  register(rule) {
    this.rules.push(rule)
  }

  extract(content) {
    // 按优先级尝试所有规则
    for (let rule of this.rules.sort((a, b) => b.priority - a.priority)) {
      let result = rule.extract(content)
      if (result) {
        return {
          ...result,
          rule_name: rule.name,
          extracted_at: Date.now()
        }
      }
    }
    return null
  }
}

module.exports = RuleEngine
```

### 技术选型规则示例

```javascript
// rules/tech-choice.js
module.exports = {
  name: "技术选型",
  priority: 100,

  patterns: [
    /选择(?:了)?(?:使用)?用\s+([A-Z][a-zA-Z0-9]+)/gi,
    /决定(?:了)?(?:使用)?\s+([A-Z][a-zA-Z0-9]+)/gi,
    /选型\s+[:：]\s*([A-Z][a-zA-Z0-9]+)/gi,
    /采用\s+([A-Z][a-zA-Z0-9]+)/gi
  ],

  reasonPatterns: [
    /因为\s+(.+?)(?:\.|。|$)/,
    /原因\s+[:：]\s*(.+?)(?:\.|。|$)/,
    /考虑\s+[:：]\s*(.+?)(?:\.|。|$)/,
    /为了\s+(.+?)(?:\.|。|$)/
  ],

  dimensionKeywords: {
    "安全|加密|隐私|保护": { name: "安全性", weight: 0.9 },
    "本地|离线|无需网络|内网": { name: "本地优先", weight: 0.8 },
    "成本|便宜|免费|预算": { name: "成本", weight: 0.5 },
    "性能|速度|快速|延迟": { name: "性能", weight: 0.7 },
    "开发体验|开发效率|易用": { name: "开发体验", weight: 0.6 },
    "社区|生态|文档": { name: "生态", weight: 0.5 },
    "跨平台|多端|统一": { name: "跨平台", weight: 0.7 }
  },

  extract(content) {
    // 1. 匹配决策
    let decision = null
    for (let pattern of this.patterns) {
      let matches = [...content.matchAll(pattern)]
      if (matches.length > 0) {
        decision = matches[0][1]
        break
      }
    }

    if (!decision) return null

    // 2. 提取理由
    let reason = null
    for (let pattern of this.reasonPatterns) {
      let match = content.match(pattern)
      if (match) {
        reason = match[1].trim()
        break
      }
    }

    // 3. 从内容中推断维度
    let dimensions = this.inferDimensions(content)
    if (dimensions.length === 0) {
      dimensions = [{ name: "未明确", weight: 0.5, reason: "无" }]
    }

    // 4. 提取上下文标签
    let contextTags = this.extractContextTags(content)

    return {
      type: "技术选型",
      decision: decision,
      dimensions: dimensions,
      alternatives_rejected: this.extractAlternatives(content, decision),
      context_tags: contextTags,
      confidence: 0.7  // 规则匹配置信度
    }
  },

  inferDimensions(content) {
    let dimensions = []

    for (let [keywords, dim] of Object.entries(this.dimensionKeywords)) {
      let regex = new RegExp(keywords, "i")
      if (regex.test(content)) {
        dimensions.push({
          name: dim.name,
          weight: dim.weight,
          reason: "规则推断"
        })
      }
    }

    return dimensions
  },

  extractContextTags(content) {
    // 提取常见的技术栈标签
    let tags = []
    let techKeywords = [
      "React", "Vue", "Svelte", "Angular",
      "Node", "Deno", "Bun",
      "PostgreSQL", "MySQL", "SQLite", "MongoDB",
      "AWS", "GCP", "Azure",
      "移动端", "Web", "桌面",
      "E2EE", "实时", "流式"
    ]

    for (let keyword of techKeywords) {
      if (content.includes(keyword)) {
        tags.push(keyword)
      }
    }

    return tags
  },

  extractAlternatives(content, decision) {
    // 简单的替代方案提取
    let alternatives = []
    let patterns = [
      /不选(?:用)?\s+([A-Z][a-zA-Z0-9]+)/gi,
      /放弃\s+([A-Z][a-zA-Z0-9]+)/gi,
      /([A-Z][a-zA-Z0-9]+)\s+(?:被放弃|被排除|有问题)/gi
    ]

    for (let pattern of patterns) {
      let matches = [...content.matchAll(pattern)]
      for (let match of matches) {
        let alt = match[1]
        if (alt !== decision && !alternatives.includes(alt)) {
          alternatives.push(alt)
        }
      }
    }

    return alternatives
  }
}
```

---

## LLM 调用策略

标注、模式验证、重构、整合四个任务需要 LLM。

**本地优先**：Ollama + Qwen/Llama 等本地模型。延迟低、无网络依赖、数据不出设备。

**API 备选**：用户自己的 API Key（Claude API / OpenAI API）。Corivo 不代管密钥。

**无 LLM 降级**：跳过需要 LLM 的任务，只执行衰减和 status 降级。规则引擎仍可工作。pending block 积压，等配置 LLM 后再处理。

```bash
corivo config set llm.provider ollama
corivo config set llm.model qwen2.5:7b
# 或
corivo config set llm.provider anthropic
corivo config set llm.api_key sk-ant-xxx

# v0.10 新增：控制 LLM 验证行为
corivo config set llm.verify_rule_results true   # 验证规则结果（默认）
corivo config set llm.verify_rule_results false  # 跳过验证，直接使用规则结果
```

---

## 设计决策

**为什么 v0.5 新增守护进程模式？** 寄生策略在理想状态下优雅，但现实中用户的工作流差异大。提供可选的守护进程，让 Corivo 在任何环境下都能稳定运行。

**为什么模式提取优先级高于普通整合？** 模式是 v0.5/v0.10 的核心能力——预测的基础。没有模式，Corivo 只是记忆层；有模式，才是数字孪生。

**为什么按优先级而非时间表？** 时间表在空闲时浪费资源，忙碌时堆积任务。优先级调度在 5 秒窗口内先做最重要的事。

**为什么限制批量大小？** 500 条 pending block 一次处理完可能跑几分钟，阻塞响应。分散到多次循环，每次快速完成。

**为什么 v0.10 引入混合方案？** 纯 LLM 成本高（月 $60），纯规则覆盖不够（70%）。混合方案节省 80% 成本，覆盖率仅下降 5%，是最优平衡点。
