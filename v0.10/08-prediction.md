# 08 · 预测性 AI

> Corivo 设计文档 v0.10 · [返回索引](./README.md)

---

## 定位

预测是 Corivo v0.5 引入的核心能力——从"记住你的决策"到"预测你的选择"，v0.10 继续完善。

这是数字孪生能力的体现：不只存储静态信息，更要学习动态模式，在新情境中代表用户的立场和偏好。

---

## 核心理念

**预测是建议，不是决定。**

Corivo 的预测基于用户历史行为模式，但最终选择权永远在用户手中。预测的价值在于：
- 加速决策：不需要从头思考所有维度
- 一致性：跨工具、跨时间保持决策逻辑一致
- 自我认知：让用户看到自己的决策模式

**预测越准，数字孪生越像你。**

---

## 三种预测类型

### 1. 决策预测

**场景**：用户面临新的选择决策

**输入**：当前情境描述（技术栈、约束条件、目标等）

**输出**：基于历史决策模式的预测建议

```
用户：我们需要为新项目选择后端框架

[corivo] 预测：基于你过去 6 个月的决策模式：

技术选型偏好：
- 安全性权重：0.9（处理敏感数据）
- 本地优先权重：0.8（离线场景）
- TypeScript 偏好：87.5%（7/8 次选择）

建议：Deno + SQLite
理由：内置 TypeScript、本地友好、安全可控

置信度：78%（基于 8 个类似历史决策）

要查看相关历史决策吗？
```

---

### 2. 沟通风格预测

**场景**：用户需要给某人发消息

**输入**：接收者、消息目的、历史沟通记录

**输出**：符合用户沟通风格的草稿

```
用户：帮我给张三写个邮件，问他API的事

[corivo] 草稿预测：

你和张三的沟通风格：
- 正式程度：中等（非正式但保持专业）
- 结构偏好：先背景，再问题，最后明确期望
- 特殊注意：他技术好，可以直接说技术细节

草稿：
"张三，关于之前讨论的 API 限流方案，我看了下几个选项。
从性能和实现复杂度考虑，我倾向令牌桶算法。
你的看法？这个方案在你们那边有坑吗？"

要调整吗？
```

---

### 3. 行为预测

**场景**：预测用户在特定情境下的反应

**输入**：情境描述

**输出**：基于历史行为的预测反应

```
[corivo] 提醒：

你之前对类似的紧急需求表达了：
- 优先级：用户体验 > 功能完整性
- 倾向：先做核心路径，MVP 快速验证
- 风险：技术债积累（你提到过 3 次担心）

这次需求是紧急交付吗？如果是，建议先确认核心路径。
```

---

## Prediction Agent

### 架构

```
┌─────────────────────────────────────────┐
│         Prediction Agent                │
├─────────────────────────────────────────┤
│  1. 情境理解                            │
│     └── 提取当前决策的关键维度和约束     │
│                                         │
│  2. 模式匹配                            │
│     └── 在历史决策模式中找到相似案例     │
│                                         │
│  3. 维度聚合                            │
│     └── 合并相似案例的决策维度权重       │
│                                         │
│  4. 置信度计算                          │
│     └── 基于匹配数量和一致性打分         │
│                                         │
│  5. 建议生成                            │
│     └── 格式化为用户友好的预测文本       │
└─────────────────────────────────────────┘
```

### 模式匹配算法

```javascript
// 伪代码
function matchPatterns(currentContext, historyPatterns) {
  let matches = []

  for (let pattern of historyPatterns) {
    // 计算情境相似度
    let similarity = calculateSimilarity(
      currentContext.tags,
      pattern.context_tags
    )

    if (similarity > 0.5) {
      matches.push({
        pattern: pattern,
        similarity: similarity
      })
    }
  }

  // 按相似度排序，返回前 10 个
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 10)
}

function aggregateDimensions(matches) {
  let dimensions = new Map()

  for (let match of matches) {
    for (let dim of match.pattern.dimensions) {
      if (!dimensions.has(dim.name)) {
        dimensions.set(dim.name, {
          name: dim.name,
          totalWeight: 0,
          count: 0,
          reasons: []
        })
      }

      let d = dimensions.get(dim.name)
      d.totalWeight += dim.weight * match.similarity
      d.count += 1
      if (dim.reason) d.reasons.push(dim.reason)
    }
  }

  // 返回平均权重排序的维度
  return Array.from(dimensions.values())
    .map(d => ({
      name: d.name,
      weight: d.totalWeight / d.count,
      reasons: d.reasons
    }))
    .sort((a, b) => b.weight - a.weight)
}

function calculateConfidence(matches, dimensions) {
  // 匹配数量越多，置信度越高
  let countScore = Math.min(matches.length / 10, 1)

  // 维度一致性越高，置信度越高
  let consistencyScore = dimensions.length > 0
    ? 1 - (dimensions[0].weight - dimensions[dimensions.length - 1]?.weight || 0)
    : 0.5

  return (countScore * 0.6 + consistencyScore * 0.4)
}
```

---

## 主动训练

用户可以主动告诉 Corivo 自己的偏好，这些训练数据会被标记为 `指令 · self · 训练`，Prediction Agent 优先参考。

### 训练接口

```bash
# 基础训练
corivo train "技术选型优先级：安全 > 成本 > 性能"

# 带情境的训练
corivo train --context "给技术团队沟通" "风格：直接、用代码示例、少用类比"

# 带理由的训练
corivo train --reason "用户数据敏感" "存储方案必须支持 E2EE"

# 批量训练（从文件）
corivo train --file preferences.json
```

### 训练数据存储

训练数据也是 block，但有特殊标记：

```
content: "技术选型优先级：安全 > 成本 > 性能"
annotation: "指令 · self · 训练 · 技术选型"
pattern: {
  type: "偏好声明",
  priority: 1,  // 训练类指令优先级最高
  dimensions: [
    {name: "安全", weight: 1.0},
    {name: "成本", weight: 0.7},
    {name: "性能", weight: 0.5}
  ]
}
```

### 训练数据应用

Prediction Agent 在生成预测时：

1. 首先检查是否有相关的训练类指令
2. 如果有，以训练数据为基准，与历史模式对比
3. 如果历史模式与训练冲突，推送冲突提醒

```
[corivo] 冲突提醒：

你的训练偏好：安全 > 成本
但最近 3 个月的项目显示：成本 > 安全

要更新训练偏好吗？
```

---

## 预测呈现

### 格式规范

所有预测输出遵循统一格式：

```
[corivo] 预测：

{预测内容}

---
依据：{N} 个相关历史决策
置信度：{X}%

要查看详细依据吗？ / 这个预测有用吗？
```

### 推送时机

| 时机 | 触发条件 |
|------|---------|
| 用户询问 | "你觉得我该选什么？" |
| 检测到决策点 | 用户在讨论选型、方案、架构时 |
| 上下文匹配 | 当前情境与高置信度历史模式匹配时 |
| 用户主动 | `corivo predict <情境>` |

---

## 反馈闭环

用户对预测的反应会改进预测准确度：

| 反应 | 效果 |
|------|------|
| 采纳 | 相关模式权重上调，未来优先推荐 |
| 忽略 | 中性信号，无变化 |
| 拒绝 | 相关模式权重下调，记录拒绝原因 |
| 修改 | 记录用户修改内容，作为新的训练数据 |

---

## 设计决策

**为什么预测是"建议"而非"决定"？** 数字孪生是代表用户，不是代替用户。用户保留最终决定权，预测只是加速决策、保持一致性的工具。

**为什么训练数据优先级最高？** 主动训练是用户直接表达的偏好，应该优先于从行为中推断的模式。当两者冲突时，推送提醒让用户知道。

**为什么需要置信度？** 置信度告诉用户什么时候该信任预测，什么时候该谨慎。低置信度的预测只是参考，高置信度的预测可以更放心采纳。

**为什么显示"要查看详细依据吗"？** 透明度建立信任。让用户看到预测基于哪些历史决策，用户会更信任 Corivo，也能发现模式提取的错误。
