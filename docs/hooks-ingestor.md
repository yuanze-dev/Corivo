# Hooks 实时采集

通过 Claude Code Hooks 系统实现对话的实时采集，无需轮询 `history.jsonl`。

## 设计原理

**轮询 vs Hooks**：

| 方式 | 优点 | 缺点 |
|------|------|------|
| 轮询 history.jsonl | 实现简单，不依赖 Claude Code 特性 | 有延迟（60s），可能遗漏，需要处理去重 |
| Hooks 实时采集 | 无延迟，确定性地捕获每次对话 | 依赖 Claude Code Hooks 系统 |

## 实现方案

### Hook 事件

| 事件 | 触发时机 | 数据字段 | 保存标注 |
|------|----------|----------|----------|
| `UserPromptSubmit` | 用户提交输入时 | `.prompt` | `事实 · self · 对话` |
| `Stop` | Claude 回复完成时 | `.last_assistant_message` | `知识 · self · 回答` |

### 文件结构

```
packages/plugins/claude-code/
├── hooks/
│   ├── hooks.json           # Hook 配置
│   └── scripts/
│       ├── ingest-turn.sh   # 实时采集脚本
│       ├── session-init.sh  # 会话初始化（原有）
│       └── stop-suggest.sh  # 上下文推送（原有）
```

### hooks.json 配置

```json
{
  "description": "Corivo Hooks - 实时采集对话 + 上下文推送",
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ingest-turn.sh user",
        "timeout": 10
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ingest-turn.sh assistant",
        "timeout": 10
      }, {
        "type": "command",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop-suggest.sh",
        "timeout": 5
      }]
    }]
  }
}
```

### ingest-turn.sh 脚本

脚本从 stdin 读取 JSON 输入，提取内容并调用 `corivo save`：

```bash
#!/usr/bin/env bash
ROLE=${1:-unknown}
INPUT=$(cat)

# 根据角色提取内容和标注
if [ "$ROLE" = "user" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.prompt // empty')
  ANNOTATION="事实 · self · 对话"
elif [ "$ROLE" = "assistant" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')
  ANNOTATION="知识 · self · 回答"
fi

# 保存到 corivo（跳过空内容）
if [ -n "$CONTENT" ] && [ ${#CONTENT} -gt 5 ]; then
  corivo save --content "$CONTENT" --annotation "$ANNOTATION" \
    --source "claude-code-hooks" --no-password
fi
```

## 日志

Hook 执行日志位于 `~/.corivo/logs/hooks-ingest.log`，保留最近 100 条记录。

## 与 HistoryIngestor 的关系

- **Hooks 实时采集**：新的主要方式，实时捕获每次对话
- **HistoryIngestor**：兜底方案，用于处理历史数据的冷扫描

两者可以并存，通过 `source` 字段区分：
- `claude-code-hooks`：来自 Hooks 实时采集
- `claude-code-history`：来自 HistoryIngestor 轮询

## 测试

```bash
# 测试用户输入采集
echo '{"prompt":"测试内容"}' | \
  bash hooks/scripts/ingest-turn.sh user

# 测试助手回复采集
echo '{"last_assistant_message":"回复内容"}' | \
  bash hooks/scripts/ingest-turn.sh assistant

# 查看日志
cat ~/.corivo/logs/hooks-ingest.log
```
