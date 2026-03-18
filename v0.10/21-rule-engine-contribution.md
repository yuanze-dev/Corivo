# 21 · 规则引擎贡献机制

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：社区共建规则库的设计

---

## 为什么需要贡献机制

规则引擎是混合模式提取方案的核心，覆盖约 80% 的常见决策模式。但：

1. **决策模式多样**：不同行业、不同角色有不同的决策模式
2. **规则维护成本**：维护一套完整的规则库需要持续投入
3. **社区力量**：用户最了解自己的决策模式，社区共建是可持续的路径

**现状**：Corivo 尚未建立社区，但设计好贡献机制，为未来铺路。

---

## 规则库结构

### 目录组织

```
~/.corivo/rules/
├── builtin/           # 内置规则（不可修改）
│   ├── technical-decision.json
│   ├── communication-style.json
│   ├── risk-assessment.json
│   └── ...
├── community/         # 社区规则（可订阅）
│   ├── @frontend/tech-stack-selection.json
│   ├── @backend/api-design.json
│   └── @data-science/model-selection.json
└── custom/            # 用户自定义规则
    ├── my-workflow.json
    └── team-convention.json
```

### 规则文件格式

```json
{
  "meta": {
    "id": "technical-decision-v1",
    "name": "技术选型决策模式",
    "author": "corivo-core",
    "version": "1.0.0",
    "category": "technical",
    "tags": ["选型", "技术栈", "架构"],
    "coverage_estimate": 0.85,
    "created_at": "2026-03-01T00:00:00Z",
    "updated_at": "2026-03-18T00:00:00Z"
  },
  "triggers": [
    "选择|用|用哪个|用什么",
    "框架|库|工具|服务",
    "技术栈|技术选型"
  ],
  "dimensions": [
    {
      "name": "安全性",
      "patterns": ["安全", "加密", "隐私", "E2EE", "零信任"],
      "weight": 1.0
    },
    {
      "name": "本地优先",
      "patterns": ["本地", "离线", "自托管", "私有化"],
      "weight": 0.8
    },
    {
      "name": "TypeScript",
      "patterns": ["TypeScript", "TS", "类型安全"],
      "weight": 0.7
    }
  ],
  "extraction_template": {
    "context_indicators": ["项目", "需求", "场景"],
    "decision_keywords": ["选择", "决定", "用", "采用"],
    "rationale_keywords": ["因为", "由于", "理由", "考虑"]
  }
}
```

---

## 贡献流程

### 步骤 1：创建规则

用户通过 CLI 创建新规则：

```bash
# 交互式创建
corivo rules create

# 从对话历史学习
corivo rules learn --from-blocks blk_1,blk_2,blk_3

# 导出当前用户的模式
corivo rules export --pattern-type technical
```

### 步骤 2：测试验证

```bash
# 本地测试规则
corivo rules test ./my-rule.json

# 查看规则在历史数据上的覆盖率
corivo rules coverage ./my-rule.json --sample 100
```

测试输出示例：

```
规则测试结果：
  ✓ 触发准确率：87% (87/100)
  ✓ 维度提取准确率：76%
  ⚠ 假阳性：13% (误触发)
  ⚠ 遗漏率：8% (应触发未触发)

建议：
  - 调整触发词，减少误触发
  - 增加"性能相关"维度
```

### 步骤 3：提交社区

```bash
# 发布到社区规则库
corivo rules publish ./my-rule.json

# 更新规则版本
corivo rules update ./my-rule.json --version 1.1.0
```

### 步骤 4：订阅与使用

```bash
# 搜索社区规则
corivo rules search "前端"

# 订阅规则
corivo rules subscribe @frontend/react-decision

# 查看已订阅规则
corivo rules list --subscribed
```

---

## 规则质量评估

### 评估维度

| 维度 | 说明 | 目标 |
|------|------|------|
| 覆盖率 | 能识别多少相关决策 | > 70% |
| 准确率 | 识别正确的比例 | > 80% |
| 误报率 | 误判为决策模式的比例 | < 15% |
| 维度完整性 | 提取维度的全面性 | > 3 个核心维度 |
| 维度准确性 | 权重设置合理性 | 人工审核 |

### 自动化评分

```bash
corivo rules score ./my-rule.json

# 输出：
规则质量评分：B+ (82/100)
  覆盖率：75% (B)
  准确率：84% (A)
  误报率：12% (B)
  维度完整性：4/5 (A)
  维度准确性：待人工审核

建议：提交前降低误报率，调整触发词精确度
```

---

## 规则生命周期

### 版本管理

- **语义化版本**：MAJOR.MINOR.PATCH
  - MAJOR：维度结构重大变化
  - MINOR：新增维度或优化触发词
  - PATCH：修复 bug

### 兼容性

```json
{
  "meta": {
    "corivo_version": ">=0.10.0",
    "deprecated": false,
    "supersedes": ["old-rule-v1"]
  }
}
```

### 淘汰机制

- **使用率 < 5%**：标记为低优先级
- **6 个月无更新**：标记为维护中
- **兼容性破坏**：提示用户升级
- **严重 bug**：紧急下架

---

## 规则市场设计

### 发现与推荐

```bash
# 按类别浏览
corivo rules browse --category design

# 按角色推荐
corivo rules recommend --role "产品经理"

# 查看热门规则
corivo rules trending
```

### 评分与评论

```json
{
  "stats": {
    "downloads": 1234,
    "subscribers": 567,
    "rating": 4.5,
    "reviews": [
      {
        "user": "user_123",
        "rating": 5,
        "comment": "很好用，覆盖了我 90% 的前端选型决策",
        "use_case": "React 项目技术选型"
      }
    ]
  }
}
```

---

## 内置规则清单

### v0.10 内置规则

| 规则 ID | 名称 | 覆盖场景 |
|---------|------|---------|
| `technical-decision-v1` | 技术选型决策 | 框架、库、工具选择 |
| `communication-style-v1` | 沟通风格 | 邮件、消息、文档语气 |
| `risk-assessment-v1` | 风险评估 | 安全、性能、成本权衡 |
| `prioritization-v1` | 优先级决策 | 任务排序、需求排期 |
| `workflow-v1` | 工作流选择 | 工具、流程、协作方式 |

### 计划中的规则

| 规则 ID | 名称 | 预计覆盖 |
|---------|------|---------|
| `api-design-v1` | API 设计决策 | REST/GraphQL/rpc |
| `data-modeling-v1` | 数据建模决策 | 关系/文档/图数据库 |
| `deployment-v1` | 部署决策 | 容器/无服务器/传统 |
| `monitoring-v1` | 监控决策 | 指标/日志/追踪 |

---

## 社区治理

### 规则审核流程

```
用户提交 → 自动测试 → 人工审核 → 发布 → 用户反馈 → 持续改进
```

### 审核标准

1. **功能正确**：规则能正确识别目标模式
2. **无恶意代码**：规则文件不含恶意内容
3. **符合规范**：遵循规则文件格式规范
4. **文档完整**：有清晰的使用说明
5. **隐私安全**：不收集用户敏感信息

### 社区角色

| 角色 | 权限 | 职责 |
|------|------|------|
| 贡献者 | 提交规则 | 编写和优化规则 |
| 审核员 | 审核规则 | 评审和质量把控 |
| 维护者 | 管理规则库 | 版本管理和发布 |
| 版主 | 管理类别 | 特定领域规则维护 |

---

## 技术实现

### 规则加载器

```typescript
// rules/loader.ts
interface RuleLoader {
  // 加载所有启用的规则
  loadEnabled(): Rule[]

  // 加载指定类别的规则
  loadByCategory(category: string): Rule[]

  // 重新加载规则（热更新）
  reload(): void

  // 验证规则格式
  validate(rule: Rule): ValidationResult
}
```

### 规则引擎接口

```typescript
// rules/engine.ts
interface RuleEngine {
  // 匹配规则
  match(text: string): MatchResult[]

  // 提取维度
  extractDimensions(text: string, rule: Rule): Dimension[]

  // 批量处理
  batch(texts: string[]): BatchResult[]
}
```

### 规则订阅管理

```typescript
// rules/subscription.ts
interface SubscriptionManager {
  // 订阅规则
  subscribe(ruleId: string): void

  // 取消订阅
  unsubscribe(ruleId: string): void

  // 更新订阅
  update(): Promise<void>

  // 列出订阅
  list(): SubscribedRule[]
}
```

---

## 设计决策

**为什么现在设计贡献机制？** 虽然还没有社区，但设计好贡献机制可以：
- 规则库结构更清晰
- 为未来社区化铺路
- 用户可以自定义规则并本地使用

**为什么内置规则有限？** 内置规则只覆盖最通用的场景。专业场景（如医疗、法律）需要领域专家贡献规则，社区共建是可持续路径。

**为什么需要审核？** 规则质量直接影响 Corivo 的准确性。低质量规则会降低用户体验，甚至误导决策。

**规则和 LLM 的边界？** 规则引擎处理高频、结构化的模式（80% 覆盖）。LLM 处理低频、模糊的模式（20% 覆盖）。规则优先，LLM 补充。
