# 01 · Block 数据模型

> Corivo 设计文档 v0.10 · [返回索引](./README.md)

---

## 定义

Block 是 Corivo 的最小存储单元——一段**语义自包含的自然语言文本**。

没有固定大小。可以是一行密码，一段决策记录，或一篇完整教程。判断标准只有一个：**一个 block 能独立回答一个问题。**

---

## Schema

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 唯一标识，如 `blk_a3f29x` |
| `content` | text | （必填） | 自然语言正文，不限长度 |
| `annotation` | string | `"pending"` | 双维度标注，格式 `性质 · 领域 · 标签` |
| `refs` | string[] | `[]` | 指向其他 block 的 ID 列表 |
| `source` | string | `"manual"` | 采集来源标识 |
| `vitality` | int | `100` | 生命力分值，0–100 |
| `status` | enum | `active` | `active` / `cooling` / `cold` / `archived` |
| `access_count` | int | `0` | 累计被查询或引用的次数 |
| `last_accessed` | datetime | `null` | 最近一次被触达的时间 |
| `consolidated_from` | string[] | `[]` | 若为整合产物，记录来源 block ID |
| **`pattern`** | **object** | **`null`** | **决策模式结构（仅决策类 block）** |
| **`pattern_source`** | **string** | **`"llm"`** | **v0.10 新增：pattern 提取来源 `rule`/`llm`/`mixed`** |
| **`prediction_confidence`** | **float** | **`null`** | **预测置信度 0-1** |
| **`namespace`** | **string** | **`"default"`** | **v0.10 新增：命名空间，用于团队版** |
| `created_at` | datetime | 写入时自动 | 创建时间 |
| `updated_at` | datetime | 写入时自动 | 最近更新时间 |

---

## v0.10 核心：Pattern 字段与混合提取方案

当 `annotation` 性质为"决策"时，心跳引擎会提取决策背后的模式。

### Pattern 结构

```json
{
  "pattern": {
    "type": "技术选型",
    "dimensions": [
      {"name": "安全性", "weight": 0.9, "reason": "需要处理用户敏感数据"},
      {"name": "本地优先", "weight": 0.8, "reason": "离线场景需求"},
      {"name": "成本", "weight": 0.5, "reason": "初期用户量小"}
    ],
    "decision": "SQLCipher",
    "alternatives_rejected": ["MongoDB", "PostgreSQL"],
    "context_tags": ["移动端", "E2EE", "离线优先"],
    "confidence": 0.85
  }
}
```

| 字段 | 说明 |
|------|------|
| `type` | 决策类型：技术选型 / 架构决策 / 产品方向 / 沟通策略 / 其他 |
| `dimensions` | 决策维度数组，每个维度包含名称、权重（0-1）、理由 |
| `decision` | 最终决定 |
| `alternatives_rejected` | 被拒绝的选项及原因（可省略） |
| `context_tags` | 适用情境标签，用于后续匹配 |
| `confidence` | 模式提取的置信度（0-1） |

---

## v0.10 新增：混合模式提取方案

**问题**：纯 LLM 提取成本高、速度慢；纯规则引擎覆盖不完整。

**解决方案**：规则引擎覆盖 80% 常见模式 + LLM 处理边缘案例。

### 三级提取策略

```
┌─────────────────────────────────────────────────────────────┐
│                    Pattern Extraction Pipeline              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: 规则引擎匹配（< 10ms，零成本）                      │
│  ─────────────────────────────────────────                  │
│  ├── 技术选型规则库                                          │
│  │   └── 检测关键词："选择用"/ "决定用"/ "选型"             │
│  │   └── 提取选项：正则匹配技术栈名称                        │
│  │   └── 提取理由：检测"因为"/ "原因是"                      │
│  │                                                          │
│  ├── 沟通规则库                                              │
│  │   └── 检测关键词："给X发消息"/ "告诉X"                    │
│  │   └── 提取风格：检测语气词和结构                          │
│  │                                                          │
│  └── 时间规则库                                              │
│      └── 检测关键词："截止"/ "之前完成"/ "周X前"             │
│      └── 提取时间：日期解析器                                │
│                                                             │
│           ↓ 匹配成功（覆盖 ~80% 常见场景）                    │
│      pattern_source = "rule"                                │
│      confidence = 0.7（规则匹配的置信度较低）                │
│           ↓                                                 │
│   Step 2: LLM 验证（可选，~500ms，低成本）                   │
│   ────────────────────────────────────────                  │
│   └── 验证规则提取的 pattern 是否准确                        │
│       └── 修正维度权重和理由                                 │
│       └── 补充遗漏的维度                                     │
│                                                             │
│           ↓ 规则不匹配或验证失败（~20% 边缘案例）            │
│      pattern_source = "llm"                                 │
│      confidence = 0.85（LLM 提取置信度较高）                 │
│           ↓                                                 │
│   Step 3: 完整 LLM 提取（~2s，高成本）                       │
│   ──────────────────────────────────────                    │
│   └── 调用完整的 Pattern Extraction Agent                   │
│       └── 提取复杂决策模式                                   │
│       └── 处理隐式推理链                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 规则引擎示例

```javascript
// 伪代码：技术选型规则
const techChoiceRule = {
  name: "技术选型",
  patterns: [
    /选择(?:了)?用\s+([A-Z][a-zA-Z]+)/,
    /决定(?:了)?(?:使用)?\s+([A-Z][a-zA-Z]+)/,
    /选型\s+[:：]\s*([A-Z][a-zA-Z]+)/
  ],
  reasonPatterns: [
    /因为\s+(.+)/,
    /原因\s+[:：]\s*(.+)/,
    /考虑\s+[:：]\s*(.+)/
  ],
  dimensionKeywords: {
    "安全|加密|隐私": { name: "安全性", weight: 0.9 },
    "本地|离线|无需网络": { name: "本地优先", weight: 0.8 },
    "成本|便宜|免费": { name: "成本", weight: 0.5 },
    "性能|速度|快速": { name: "性能", weight: 0.7 }
  },

  extract(content) {
    // 1. 匹配决策
    const decision = this.matchDecision(content)
    if (!decision) return null

    // 2. 提取理由
    const reason = this.matchReason(content)

    // 3. 从理由中推断维度
    const dimensions = this.inferDimensions(reason || content)

    // 4. 生成 pattern
    return {
      type: "技术选型",
      decision: decision,
      dimensions: dimensions,
      alternatives_rejected: [],
      context_tags: this.extractTags(content),
      confidence: 0.7  // 规则匹配置信度较低
    }
  }
}
```

### 混合策略触发逻辑

```javascript
// 伪代码：混合提取策略
function extractPattern(block, llmAvailable) {
  // Step 1: 先尝试规则引擎
  let pattern = ruleEngine.extract(block.content)

  if (pattern) {
    // 规则匹配成功

    // Step 2: 如果有 LLM，验证规则结果
    if (llmAvailable && config.llm.verify_rule_results) {
      let verified = await llmService.verifyPattern(pattern, block.content)

      if (verified.confidence > 0.8) {
        // 验证通过，使用修正后的 pattern
        return {
          ...verified.pattern,
          pattern_source: "mixed",
          confidence: verified.confidence
        }
      }
    }

    // 无 LLM 或验证失败，使用规则结果
    return {
      ...pattern,
      pattern_source: "rule",
      confidence: pattern.confidence
    }
  }

  // Step 3: 规则不匹配，使用 LLM
  if (llmAvailable) {
    let llmPattern = await llmService.extractPattern(block.content)
    return {
      ...llmPattern,
      pattern_source: "llm",
      confidence: llmPattern.confidence
    }
  }

  // 无 LLM 可用，留空
  return null
}
```

### 成本对比

| 方案 | 单次成本 | 月成本（1000次/天） | 覆盖率 | 准确率 |
|------|---------|---------------------|--------|--------|
| 纯 LLM | ~$0.002 | ~$60 | 95% | 85% |
| **混合方案** | **~$0.0004** | **~$12** | **90%** | **80%** |
| 纯规则 | $0 | $0 | 70% | 65% |

**混合方案节省 80% 成本，覆盖率仅下降 5%。**

---

## 生命状态

Block 有两种状态：

**未完成态（pending）**——刚从采集管道写入，annotation 为 `"pending"`。心跳引擎的 Ingestion Agent 会异步补全标注。查询时默认不返回 pending block。

**完成态**——annotation 已被补全为正式的双维度标注。参与正常的查询、整合、衰减、模式提取流程。

---

## Annotation 双维度标注

annotation 由两个正交维度组成，格式为 `性质 · 领域 · 标签`。Agent 在写入时自主判断，不需要用户指定。

### 维度一：性质（Agent 怎么处理）

| 性质 | 说明 | Agent 行为 |
|------|------|-----------|
| **事实** | 密码、配置、数据点、具体事件 | 精确存取 |
| **知识** | 教程、总结、分析、方法论 | 可检索内部片段 |
| **决策** | 选型结论、方案确定、规则约定 | 跟踪演化，提取 pattern，可能被新决策覆盖 |
| **指令** | 用户偏好、行为规则、自动化触发 | Agent 读后改变自身行为；训练类指令优先级最高 |

### 维度二：领域（跟什么绑定）

| 领域 | 说明 | 示例 |
|------|------|------|
| `self` | 用户本人 | 偏好、习惯、健康、价值观 |
| `people` | 具体的人 | 生日、关系、沟通风格、承诺 |
| `project` | 有目标和终点的事 | 产品设计决策、旅行计划 |
| `area` | 需要长期维护的领域 | 财务、健康、职业发展 |
| `asset` | 具体的物/账户/资源 | 密码、服务器、银行账号 |
| `knowledge` | 独立于场景的通用知识 | 技术教程、行业认知 |
| `team` | v0.10 新增：团队共享信息 | 团队决策、共享知识 |

### 标注示例

```
事实 · asset · AWS 凭证
决策 · project · corivo · 存储选型
指令 · self · 周报格式偏好
指令 · self · 训练 · 技术选型优先级
事实 · people · 妈妈 · 生日
知识 · knowledge · Supabase 部署教程
决策 · project · corivo · 跨平台客户端选型
指令 · area · 健康 · 每周运动提醒规则
决策 · team · corivo · 代码审查规范    ← v0.10 新增
```

---

## Agent 操作接口

| 操作 | 说明 |
|------|------|
| **写入** | 从对话/消息/文件中提取信息，自主切分粒度，生成 block 并标注 annotation |
| **查询** | 语义搜索 + annotation 结构化过滤，先缩小范围再精确匹配 |
| **更新** | 判断新信息与已有 block 是否冲突，执行替换或合并 |
| **关联** | 在 block 之间建立 refs 引用，不侵入正文 |
| **训练** | 用户主动告诉 Corivo 自己的偏好，生成训练类 block |
| **预测** | 基于历史模式预测用户在新情境下的选择 |
| **共享** | v0.10 新增：将 block 共享到团队命名空间 |

### 查询策略

Agent 将用户的自然语言问题翻译为 annotation 维度的过滤条件：

| 用户问题 | 查询策略 |
|---------|---------|
| "AWS 密码是什么？" | `asset · AWS` + 性质 `事实` |
| "张三上次说了什么？" | `people · 张三` |
| "Corivo 项目的所有决策？" | `project · corivo` + 性质 `决策` |
| "你会建议我选什么后端框架？" | 调用 Prediction Agent 基于历史模式预测 |
| "我的技术选型偏好是什么？" | 聚合所有决策类 block 的 pattern.dimensions |
| "团队对 X 的决策是什么？" | v0.10：查询 `team · *` + 性质 `决策` |

---

## 设计决策

**为什么是扁平结构而非嵌套？** LLM 处理文本是线性的，树状结构的序列化增加 token 开销。扁平 block + refs 引用在表达力等价的同时，Agent 操作成本更低。

**为什么用双维度标注而非主题分类？** 主题分类是给人浏览用的，Agent 不需要浏览，需要精确筛选。按"跟什么实体绑定"比按"属于哪个生活领域"更适合 Agent 检索。

**为什么 v0.10 采用混合方案？** 纯 LLM 成本高，纯规则覆盖不够。混合方案在成本和准确性之间取得最佳平衡，规则引擎处理 80% 常见场景，LLM 处理 20% 复杂案例。

**为什么 pattern_source 字段很重要？** 它告诉用户这个 pattern 是怎么来的 —— 规则匹配的置信度较低（0.7），LLM 提取的置信度较高（0.85）。用户可以据此判断是否要人工验证。
