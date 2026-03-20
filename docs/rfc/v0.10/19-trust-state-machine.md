# 19 · 信任状态机

> Corivo 设计文档 v0.10 · [返回索引](./README.md)
> 补充文档：信任降级状态机完整设计

---

## 状态机总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Corivo 信任状态机                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  状态                                                                 │
│  ├── Level 0: READ_ONLY      只读                                   │
│  ├── Level 1: INFORMED       告知执行                               │
│  ├── Level 2: REQUESTED      请求执行                               │
│  └── PAUSED                  暂停                                   │
│                                                                         │
│  降级原因                                                             │
│  ├── USER_ERROR              用户误操作                               │
│  ├── EXEC_ERROR              执行错误                                 │
│  ├── TRUST_LOSS              信任危机                                 │
│  └── TEMPORARY               暂时关闭                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 状态定义

| 状态 | 说明 | 可执行操作 | 推送行为 |
|------|------|-----------|---------|
| `READ_ONLY` | 只读，仅提醒 | 查询 | 显示提醒 |
| `INFORMED` | 告知执行 | 查询、低风险操作 | 执行后告知 |
| `REQUESTED` | 请求执行 | 查询、中风险操作 | 执行前请求 |
| `PAUSED` | 暂停 | 仅查询 | 无推送 |

---

## 完整状态转换图

```
                                    ┌───────────────────────┐
                                    │       初始化            │
                                    │   (安装 Corivo)        │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │      READ_ONLY         │
                                    │   (默认初始状态)       │
                                    └───────────────────────┘
                                                │
                    ┌───────────────────────┴───────────────────────┐
                    │                                             │
                    │ 使用 1 周 + 采纳 ≥5 条                      │
                    ▼                                             │
        ┌───────────────────────┐                   ┌───────────────────────┐
        │   检查升级条件          │                   │   用户手动降级        │
        │   (自动触发)            │                   └───────────┬───────────┘
        └───────────┬───────────┘                               │
                    │ 条件满足?                                 │
                    ├─Yes─┐                                       │
                    │    │                                       │
                    ▼    │ No                                      ▼
        ┌───────────────────┐    │                        ┌───────────────┐
        │   提议升级到 INFORMED  │    │                        │   保持 READ_ONLY│
        └───────────┬───────────┘    │                        └───────────────┘
                    │    │用户同意?                              │
                    ├─Yes─├─No─────────────────────────────────┤
                    │    │                                       ▼
                    ▼    │                           ┌───────────────┐
        ┌───────────────────────┐    │                           │  升级检查失败  │
        │      INFORMED         │    │                           │  (30天后重试)  │
        └───────────────────────┘    │                           └───────────────┘
                    │    │                                       │
                    │    └───────────────────────────────────────┘
                    │
                    │ 用户手动降级 / 检测到执行错误 / 撤销率>5%
                    ▼
        ┌───────────────────────┐
        │   记录降级原因          │
        └───────────┬───────────┘
                    │
      ┌───────────┼───────────┬───────────┐
      │           │           │           │
      ▼           ▼           ▼           ▼
  USER_ERROR  EXEC_ERROR  TRUST_LOSS  TEMPORARY
      │           │           │           │
      │           │           │           │
      ▼           ▼           ▼           ▼
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ 快速恢复     │ 进入观察期     │ 完整重建       │ 一键恢复       │
│ (立即恢复)   │ (7天观察期)   │ (重建信任)     │ (无需等待)     │
└───────┬───────┴───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
  [用户触发]      [7天等待]      [7天学习期]      [用户触发]
        │               │               │               │
        ▼               ▼               ▼               ▼
    回到           回到           回到             回到
  降级前状态     INFORMED       READ_ONLY         降级前状态
    (快速)         (观察通过)     (重建通过)        (快速)
```

---

## 降级原因详解

### 原因 1: USER_ERROR（用户误操作）

```
触发：用户主动降级
  └── $ corivo config set tools.level 0
  └── 用户选择"暂不使用此功能"

状态：临时降级
恢复路径：快速恢复（无需等待）

恢复流程：
  用户触发恢复
    │
    ▼
  检查降级原因 = USER_ERROR
    │
    ▼
  直接恢复到降级前状态
    │
    └──> 无需观察期，无需条件
```

**示例：**
```bash
$ corivo config set tools.level 0
# 用户误操作...

$ corivo trust restore
检测到您之前因误操作降级。
已恢复到 Level 1（告知执行）。
```

---

### 原因 2: EXEC_ERROR（执行错误）

```
触发：连续执行失败
  ├── 连续 3 次执行失败 / 24 小时
  └── 或撤销率 > 20% / 7 天

状态：需要观察期
恢复路径：7 天观察期 + 执行计数限制

观察期要求：
  ├── 持续 7 天
  ├── 执行错误率 = 0（无新失败）
  └── 撤销率 < 5%

恢复流程：
  进入观察期
    │
    ├── Day 1-7：监控执行
    │       ├── 错误率 > 0 → 延长观察期 7 天
    │       └── 错误率 = 0 → 继续
    │
    ▼
  7 天无新失败
    │
    ▼
  检查撤销率
    │
    ├─ < 5% ───────────────────┐
    │                         │
    │                         ▼
    │                    允许恢复
    │                         │
    └─────────────────────────┘
```

**示例：**
```bash
$ corivo trust restore
检测到您因执行错误降级（8天前）。
观察期已通过。

过去 7 天的执行记录：
  ✓ 0 次执行错误
  ✓ 撤销率 3.3% (< 5%)

要恢复到 Level 2 吗？(y/n)
```

---

### 原因 3: TRUST_LOSS（信任危机）

```
触发：严重执行错误
  ├── 3 次以上执行错误（单次）
  └── 用户手动标记"不信任"

状态：需要完整重建信任
恢复路径：三阶段重建流程

重建流程：
  阶段 1：观察期（7 天）
    ├── Corivo 只提供建议，不执行
    ├── 用户手动选择采纳
    └── 采纳率需 > 80%

  阶段 2：测试期（14 天）
    ├── 允许自动执行低风险操作
    ├── 高风险操作仍需确认
    └── 错误率需 < 3%

  阶段 3：信任恢复
    ├── 恢复到 INFORMED
    └── 继续观察 30 天，无问题则可升级到 REQUESTED
```

**示例：**
```bash
$ corivo trust restore
检测到您因执行问题降级（15天前，3次错误）。

需要重新建立信任：

  阶段 1：观察期（7 天）
    Corivo 只提供建议，您手动选择是否采纳
    采纳率需 > 80% 才能进入下一阶段

  [开始重建] [稍后提醒] [取消]
```

---

### 原因 4: TEMPORARY（暂时关闭）

```
触发：用户主动暂停
  └── $ corivo trust pause

状态：保持原级别，但功能暂停
恢复路径：一键恢复，无需条件

恢复流程：
  用户触发恢复
    │
    ▼
  检查暂停方式 = TEMPORARY
    │
    ▼
  直接恢复到暂停前状态
    │
    └──> 无需观察期，保留原级别
```

**示例：**
```bash
$ corivo trust pause
工具调用已暂停。
要恢复，运行：corivo trust resume

$ corivo trust resume
已恢复工具调用功能。
当前级别：Level 2（请求执行）
```

---

## 状态机数据结构

```typescript
// 信任状态定义
interface TrustState {
  level: 'READ_ONLY' | 'INFORMED' | 'REQUESTED' | 'PAUSED'
  downgradeReason?: 'USER_ERROR' | 'EXEC_ERROR' | 'TRUST_LOSS' | 'TEMPORARY'
  downgradeTime?: number
  previousLevel?: 'INFORMED' | 'REQUESTED'

  // 观察期状态（仅 EXEC_ERROR / TRUST_LOSS）
  observation?: {
    startDate: number
    failures: number          // 观察期内的新失败
    revocations: number      // 观察期内的撤销次数
    checkDate: number       // 下次检查时间
  }

  // 重建阶段状态（仅 TRUST_LOSS）
  rebuildPhase?: 0 | 1 | 2
  rebuildProgress?: {
    adoptionRate: number
    errorRate: number
    lastCheck: number
  }
}

// 状态转换验证
function canTransition(from: TrustState, to: TrustState): boolean {
  // READ_ONLY → INFORMED
  if (from.level === 'READ_ONLY' && to.level === 'INFORMED') {
    return true  // 允许升级
  }

  // INFORMED → REQUESTED
  if (from.level === 'INFORMED' && to.level === 'REQUESTED') {
    return true  // 允许升级
  }

  // 任何 → PAUSED
  if (to.level === 'PAUSED') {
    return true  // 允许暂停
  }

  // PAUSED → 原状态
  if (from.level === 'PAUSED' && to.downgradeReason === 'TEMPORARY') {
    return true  // 允许恢复
  }

  // 任何 → READ_ONLY (降级)
  if (to.level === 'READ_ONLY') {
    return true  // 允许降级
  }

  // 恢复路径需要验证
  if (from.level === 'READ_ONLY' && to.level === 'INFORMED') {
    return validateRestore(from, to)
  }

  return false
}

// 恢复验证
function validateRestore(from: TrustState, to: TrustState): boolean {
  switch (from.downgradeReason) {
    case 'USER_ERROR':
      // 快速恢复
      return true

    case 'EXEC_ERROR':
      // 需要 7 天观察期 + 无新失败
      if (!from.observation) return false
      const daysElapsed = (Date.now() - from.observation.startDate) / 86400000
      return daysElapsed >= 7 && from.observation.failures === 0

    case 'TRUST_LOSS':
      // 需要完成重建流程
      if (!from.rebuildPhase) return false
      return from.rebuildPhase === 2 && from.rebuildProgress.adoptionRate > 0.8

    case 'TEMPORARY':
      // 一键恢复
      return true

    default:
      return false
  }
}
```

---

## CLI 命令实现

```bash
# 查看当前状态
$ corivo trust status

当前信任级别：Level 1（告知执行）
  - 可执行：配置更新、内部消息、文件修改
  - 需请求：对外消息、代码操作、金钱操作

信任统计：
  - 使用时长：23 天
  - 执行次数：47 次
  - 撤销次数：2 次 (4.3%)
  - 拒绝次数：5 次 (10.6%)
  - 采纳推送：38 / 52 (73%)

升级条件评估：
  ✓ 使用时长：23 天 (需 7 天)
  ✓ 执行次数：47 次 (需 10 次)
  ⚠ 撤销率：4.3% (需 < 5%)
  ✓ 拒绝率：10.6% (需 < 15%)

评估结果：接近升级条件，建议继续使用 1 周后升级。

# 查看降级历史
$ corivo trust history

降级历史：
  2026-03-15  READ_ONLY → INFORMED  (升级)
  2026-03-10  INFORMED  → READ_ONLY  (用户误操作，已恢复)
  2026-02-20  READ_ONLY           (初始化)

# 触发状态变更
$ corivo trust event --type EXEC_ERROR --error "GitHub API timeout"
已记录执行错误。这是最近 24 小时内的第 1 次错误。
（连续 3 次错误将触发自动降级建议）
```

---

## 配置存储

```json
// ~/.corivo/trust.json
{
  "level": "INFORMED",
  "downgradeReason": null,
  "downgradeTime": null,
  "previousLevel": null,
  "observation": null,
  "rebuildPhase": null,
  "rebuildProgress": null,
  "statistics": {
    "since": "2026-03-01T00:00:00Z",
    "executions": 47,
    "revocations": 2,
    "rejections": 5,
    "pushAdoptions": 38,
    "pushTotal": 52
  },
  "history": [
    {
      "from": "READ_ONLY",
      "to": "INFORMED",
      "timestamp": "2026-03-15T10:00:00Z",
      "reason": "upgrade",
      "trigger": "automatic"
    }
  ]
}
```

---

## 设计决策

**为什么需要 4 种降级原因？** 不同原因代表不同严重程度，需要不同恢复策略。误操作可以立即恢复，信任危机需要重建。

**为什么 EXEC_ERROR 需要观察期？** 执行错误可能是暂时的（网络问题），需要观察确认是否系统性问题。7 天是平衡灵敏度和用户耐心。

**为什么 TRUST_LOSS 需要分阶段？** 信任是逐步建立的，重建也需要逐步。从观察到测试到恢复，让用户重新建立信心。

**为什么 PAUSED 不是降级？** PAUSED 是临时状态，不改变信任级别，只是暂时禁用功能。恢复时回到原状态，不需要经历观察期。
