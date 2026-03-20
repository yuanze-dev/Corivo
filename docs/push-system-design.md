# Corivo 统一推送系统设计

## 问题分析

### 当前状态

```
┌─────────────────────────────────────────────────────────────┐
│                     分散的推送点                             │
│                                                              │
│  Hooks:                                                      │
│    - session-init.sh → 记忆状态 + suggest                    │
│    - stop-suggest.sh  → suggest                              │
│                                                              │
│  CLI 命令:                                                   │
│    - query → pushContext (相关记忆)                          │
│    - status → pushNeedsAttention (需要关注)                  │
│                                                              │
│  ContextPusher (8 个方法，仅用 2 个):                         │
│    ✅ pushContext      - query 使用                          │
│    ✅ pushNeedsAttention - status 使用                       │
│    ❌ pushStats        - 未使用                              │
│    ❌ pushPatterns     - 未使用                              │
│    ❌ pushRelated      - 未使用                              │
│    ❌ pushConflicts    - 未使用                              │
│    ❌ pushDecisions    - 未使用                              │
│    ❌ pushSummary      - 未使用                              │
│                                                              │
│  其他系统:                                                   │
│    - ReminderManager (reminders.json)                        │
│    - SuggestionEngine (新实现的 suggest)                     │
│                                                              │
│  问题：                                                       │
│    1. 功能重复（suggest vs reminders）                        │
│    2. 没有统一的推送策略                                     │
│    3. 可能重复推送相同内容                                   │
│    4. ContextPusher 方法未被充分利用                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 设计目标

1. **统一入口**：所有推送通过 `PushManager`
2. **优先级策略**：建议 > 矛盾 > 需关注 > 统计
3. **去重机制**：同一会话不重复推送
4. **上下文感知**：根据触发时机选择合适的推送内容

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        PushManager                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  推送触发点                            │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐│ │
│  │  │ SessionStart     │  │ PostRequest      │  │ CLI Command ││ │
│  │  │ (会话启动)        │  │ (请求完成后)      │  │ (query等)   ││ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘│ │
│  └───────────┼────────────────────┼──────────────────┼─────────┘ │
│              │                    │                     │           │
│              ▼                    ▼                     ▼           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  推送策略层                              │ │
│  │                                                              │ │
│  │  根据上下文选择推送类型：                                     │ │
│  │  - SessionStart: 建议 + 需关注                               │ │
│  │  - PostRequest: 建议（如果 Claude Code 没有）                │ │
│  │  - Query: 相关记忆 + 关联 + 决策                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│              │                                                    │
│              ▼                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  推送内容层                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │ │
│  │  │ Suggest  │ │ Conflict │ │ Attention │ │ Context      │    │ │
│  │  │ (建议)    │ │ (矛盾)    │ │ (需关注)   │ │ (相关记忆)    │    │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │ │
│  │                                                              │ │
│  │  整合 ContextPusher + SuggestionEngine                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│              │                                                    │
│              ▼                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  去重过滤层                                 │ │
│  │                                                              │ │
│  │  - 会话级别去重（session_id）                                │ │
│  │  - 时间窗口去重（同一内容 5 分钟内不重复）                    │ │
│  │  - 优先级排序（重要内容优先）                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│              │                                                    │
│              ▼                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  格式化输出层                              │ │
│  │                                                              │ │
│  │  统一格式：                                                   │ │
│  │  [corivo] 内容 (带图标和元数据)                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 推送类型与优先级

| 优先级 | 类型 | 图标 | 触发条件 | 示例 |
|--------|------|------|----------|------|
| **P0** | Suggest | 🌱 | 会话启动 / 请求后 | `[corivo] 继续做 feature X` |
| **P1** | Conflict | ⚡ | 检测到矛盾 | `[corivo] 与之前的决策冲突...` |
| **P2** | Decision | 💡 | 相关决策经验 | `[corivo] 相关决策: ...` |
| **P3** | Attention | ⚠️ | 需要关注（冷却/冷冻） | `[corivo] 3 条记忆需要关注` |
| **P4** | Context | 📚 | 相关记忆 | `[corivo] 相关记忆 (2 条)` |
| **P5** | Stats | 📊 | 记忆统计 | `[corivo] 128 blocks | 75% active` |

---

## 推送策略

### SessionStart（会话启动）

```
优先级顺序：Suggest > Attention > Stats

1. Suggest - 基于长期记忆预测下一步
2. Attention - 冷却/冷冻的重要记忆
3. Stats - 记忆统计（仅在首次显示）

限制：最多 3 条推送
```

### PostRequest（请求完成后）

```
优先级顺序：Suggest > Conflict

1. 如果 Claude Code 有明显下一步 → 让出，不推送
2. 否则推送 Suggest

限制：最多 1 条推送
```

### Query（查询命令）

```
优先级顺序：Context > Related > Decision > Conflict

1. Context - 相关记忆（必推）
2. Related - 关联记忆
3. Decision - 相关决策经验
4. Conflict - 检测矛盾

限制：最多 4 条推送
```

---

## 去重机制

### 会话级别去重

```typescript
// 每个会话有唯一 ID
const sessionId = generateSessionId();

// 记录已推送的内容
const pushed = new Set<string>();

// 推送前检查
if (pushed.has(contentHash)) {
  return; // 跳过重复推送
}
pushed.add(contentHash);
```

### 时间窗口去重

```typescript
// 同一内容 5 分钟内不重复推送
const lastPushed = new Map<string, number>();

const now = Date.now();
const lastTime = lastPushed.get(contentHash) || 0;

if (now - lastTime < 5 * 60 * 1000) {
  return; // 5 分钟内推送过，跳过
}
lastPushed.set(contentHash, now);
```

---

## 文件结构

```
packages/cli/src/
  push/
    context.ts           # 现有 ContextPusher（保留）
    push-manager.ts      # 新增：推送管理器
    push-types.ts        # 新增：推送类型定义
    dedup.ts             # 新增：去重机制

  cli/commands/
    suggest.ts           # 保留，但改用 PushManager
    query.ts             # 改用 PushManager
    status.ts            # 改用 PushManager

  engine/
    suggestion.ts        # 保留，被 PushManager 调用

packages/plugins/hooks/scripts/
  session-init.sh        # 简化，调用 corivo push
  stop-suggest.sh        # 简化，调用 corivo push
```

---

## CLI 命令

```bash
# 内部命令（供 hooks 调用）
corivo push --context session-start
corivo push --context post-request --last-message "..."

# 选项
--context <type>     # session-start | post-request | query
--last-message <text> # Claude 最后的回复（post-request 时）
--query <text>       # 查询关键词（query 时）
--max-items <n>     # 最大推送数量（默认 3）
--format <type>      # text | json
```

---

## 开发任务

- [ ] 实现 PushManager 核心类
- [ ] 实现去重机制 DedupManager
- [ ] 实现 push 命令
- [ ] 更新 session-init.sh
- [ ] 更新 stop-suggest.sh
- [ ] 重构 query.ts 使用 PushManager
- [ ] 重构 status.ts 使用 PushManager
- [ ] 测试各种场景
- [ ] 更新文档

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2025-03-20 | 初始设计 |
