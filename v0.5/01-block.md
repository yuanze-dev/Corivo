# 01 · Block 数据模型

> Corivo 设计文档 v0.5 · [返回索引](./README.md)

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
| **`pattern`** | **object** | **`null`** | **v0.5 新增：决策模式结构（仅决策类 block）** |
| **`prediction_confidence`** | **float** | **`null`** | **v0.5 新增：预测置信度 0-1** |
| `created_at` | datetime | 写入时自动 | 创建时间 |
| `updated_at` | datetime | 写入时自动 | 最近更新时间 |

---

## v0.5 新增：Pattern 字段（决策模式）

当 `annotation` 性质为"决策"时，心跳引擎的 Pattern Extraction Agent 会提取决策背后的模式：

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

### Pattern 结构

| 字段 | 说明 |
|------|------|
| `type` | 决策类型：技术选型 / 架构决策 / 产品方向 / 沟通策略 / 其他 |
| `dimensions` | 决策维度数组，每个维度包含名称、权重（0-1）、理由 |
| `decision` | 最终决定 |
| `alternatives_rejected` | 被拒绝的选项及原因（可省略） |
| `context_tags` | 适用情境标签，用于后续匹配 |
| `confidence` | 模式提取的置信度（0-1） |

### 模式匹配

Prediction Agent 通过对比新情境与历史模式的 `dimensions` 和 `context_tags`，生成预测：

```javascript
// 伪代码
function predict(userContext, historyPatterns) {
  let matches = historyPatterns.filter(p =>
    p.context_tags.some(tag => userContext.tags.includes(tag))
  )

  let dimensions = aggregateDimensions(matches)
  let confidence = calculateConfidence(matches.length, dimensions.consensus)

  return {
    prediction: dimensions.topScoringOption(),
    confidence: confidence,
    reasoning: dimensions.explain()
  }
}
```

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

### 标注示例

```
事实 · asset · AWS 凭证
决策 · project · corivo · 存储选型
指令 · self · 周报格式偏好
指令 · self · 训练 · 技术选型优先级    ← v0.5 新增：训练类指令
事实 · people · 妈妈 · 生日
知识 · knowledge · Supabase 部署教程
决策 · project · corivo · 跨平台客户端选型
指令 · area · 健康 · 每周运动提醒规则
```

---

## Agent 操作接口

| 操作 | 说明 |
|------|------|
| **写入** | 从对话/消息/文件中提取信息，自主切分粒度，生成 block 并标注 annotation |
| **查询** | 语义搜索 + annotation 结构化过滤，先缩小范围再精确匹配 |
| **更新** | 判断新信息与已有 block 是否冲突，执行替换或合并 |
| **关联** | 在 block 之间建立 refs 引用，不侵入正文 |
| **训练** | v0.5 新增：用户主动告诉 Corivo 自己的偏好，生成训练类 block |
| **预测** | v0.5 新增：基于历史模式预测用户在新情境下的选择 |

### 查询策略

Agent 将用户的自然语言问题翻译为 annotation 维度的过滤条件：

| 用户问题 | 查询策略 |
|---------|---------|
| "AWS 密码是什么？" | `asset · AWS` + 性质 `事实` |
| "张三上次说了什么？" | `people · 张三` |
| "Corivo 项目的所有决策" | `project · corivo` + 性质 `决策` |
| "你会建议我选什么后端框架？" | v0.5：调用 Prediction Agent 基于历史模式预测 |
| "我的技术选型偏好是什么？" | v0.5：聚合所有决策类 block 的 pattern.dimensions |

---

## 设计决策

**为什么是扁平结构而非嵌套？** LLM 处理文本是线性的，树状结构的序列化增加 token 开销。扁平 block + refs 引用在表达力等价的同时，Agent 操作成本更低。

**为什么用双维度标注而非主题分类？** 主题分类是给人浏览用的，Agent 不需要浏览，需要精确筛选。按"跟什么实体绑定"比按"属于哪个生活领域"更适合 Agent 检索。

**为什么 v0.5 新增 pattern 字段？** 决策类 block 的核心价值不是"做了什么决定"，而是"为什么这么决定"。提取决策维度后，Corivo 可以在新情境中复用这个决策逻辑，实现预测性建议。

**为什么 pattern 是可选字段？** 只有决策类 block 需要模式提取。事实、知识、指令类 block 不需要 pattern，避免存储冗余。
