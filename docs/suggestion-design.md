# Corivo Context Suggestion 设计文档

## 概述

基于长期记忆预测用户下一步会输入什么，在会话启动和请求完成后自动显示建议。

**核心哲学**（参考 Claude Code v2）：
> 预测用户会打什么，不是你觉得他们该做什么

判断标准：用户看到这个建议后会不会觉得「我刚好要打这个」。

---

## 与 Claude Code Prompt Suggestion 的区别

| | Claude Code | Corivo |
|---|---|---|
| **数据源** | 当前会话对话 | 长期 Block 记忆 |
| **预测范围** | "接下来" | "可能想继续的事" |
| **典型场景** | 修完 bug → "run tests" | 3 天前的决策 → "继续做 X" |

---

## 显示逻辑

```
┌─────────────────────────────────────────────────────────────┐
│                        Stop Hook                            │
│                                                              │
│  Claude Code 有 suggestion → 显示它的                        │
│  Claude Code 没有 → 显示 Corivo 的                           │
│                                                              │
│  优先级：Claude Code > Corivo                                │
│  理由：即时任务优先，长期记忆补充                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 显示格式

```
[corivo] 建议内容

示例：
[corivo] 继续做 feature X
[corivo] 检查之前决定的 TypeScript 迁移
[corivo] 跟进 API 文档补充
```

- 前缀 `[corivo]` 标识来源
- 2-12 个词
- 匹配用户的表达风格
- 简洁直接

---

## 触发时机

| 时机 | 条件 | 示例 |
|------|------|------|
| **会话启动** | 总是显示最相关的 1 条 | "[corivo] 继续做 feature X" |
| **请求完成后** | Claude Code 没有 suggestion 时 | Claude 回复后无建议 → 显示 Corivo 的 |

---

## 预测场景

### ✅ Corivo 应该预测的（基于长期记忆）

| 场景 | 建议示例 |
|------|---------|
| 未完成的决策 | "[corivo] 继续做 feature X" |
| 需要跟进的事项 | "[corivo] 检查 API 文档补充" |
| 跨会话的连续任务 | "[corivo] 完成数据库迁移" |
| 冷却中的重要记忆 | "[corivo] 复习 React hooks 决策" |
| 矛盾提醒 | "[corivo] 解决 TypeScript 配置冲突" |

### ❌ Corivo 不预测的（让 Claude Code 处理）

| 场景 | 理由 |
|------|------|
| 刚修完 bug → "run tests" | 即时任务，Claude Code 更适合 |
| 刚写完代码 → "try it out" | 同上 |
| 刚测试通过 → "commit this" | 同上 |

---

## 技术实现

### 1. CLI 内部命令

```bash
corivo suggest --context "..." [--last-message "..."]
```

**参数**：
- `--context`: 上下文类型（`session-start` | `post-request`）
- `--last-message`: Claude 最后的回复内容（用于判断是否应该让出）

**输出**：
```
[corivo] 继续做 feature X
```
或空（无建议时）

### 2. Hook 调用

**session-init.sh**:
```bash
SUGGESTION=$(corivo suggest --context session-start 2>/dev/null || true)
if [ -n "$SUGGESTION" ]; then
  echo "$SUGGESTION"
fi
```

**stop-suggest.sh**:
```bash
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')
SUGGESTION=$(corivo suggest --context post-request --last-message "$LAST_MESSAGE" 2>/dev/null || true)
if [ -n "$SUGGESTION" ]; then
  # 输出建议格式
  jq -n --arg suggestion "$SUGGESTION" '{"additionalContext": $suggestion}'
fi
```

### 3. 建议生成逻辑

```
┌─────────────────────────────────────────────────────────────┐
│                    建议生成流程                              │
│                                                              │
│  1. 查询活跃 Block（按 vitality 排序）                        │
│  2. 过滤：                                                   │
│     - 决策类优先                                            │
│     - 未完成的（refs 为空或状态非 archived）                 │
│     - 3-7 天内创建的（不太旧也不太新）                       │
│  3. 生成建议（模板匹配）                                     │
│  4. 输出或返回空                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4. 建议模板

| Block 类型 | 建议模板 |
|-----------|---------|
| 决策·project | "继续做 {decision}" |
| 决策·asset | "检查 {decision} 状态" |
| 事实·people（待办） | "跟进 {content}" |
| 知识·knowledge（高频访问） | "复习 {topic}" |

---

## 文件结构

```
packages/cli/src/
  cli/commands/
    suggest.ts           # 新增：suggest 命令
  engine/
    suggestion.ts        # 新增：建议生成逻辑

packages/plugins/hooks/scripts/
  session-init.sh        # 修改：启动时显示建议
  stop-suggest.sh        # 修改：请求后显示建议
```

---

## 开发任务

- [ ] 实现 `suggest.ts` 命令
- [ ] 实现 `suggestion.ts` 引擎
- [ ] 更新 `session-init.sh`
- [ ] 更新 `stop-suggest.sh`
- [ ] 测试各种场景
- [ ] 更新文档

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2025-03-20 | 初始设计 |
