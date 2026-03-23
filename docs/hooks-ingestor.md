# Corivo 实时采集

Corivo 支持多种实时采集方式，根据不同 AI 工具的特性选择最优方案。

## 采集方式对比

| 工具 | 采集方式 | 延迟 | 数据源 |
|------|----------|------|--------|
| Claude Code | Hooks 事件驱动 | 实时 | 会话事件 |
| OpenClaw | 文件监听 | <500ms | gateway.log |

---

## Claude Code Hooks 采集

### 设计原理

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

---

## OpenClaw 文件监听采集

### 设计原理

OpenClaw 没有「用户输入」级别的 Hook 事件，只有命令级别的事件（`command:new`、`command:stop` 等）。因此采用**文件监听**方案：

| 方式 | 优点 | 缺点 |
|------|------|------|
| 轮询 gateway.log | 实现简单 | 有延迟（60s），资源浪费 |
| fs.watch 监听 | 实时响应，低资源消耗 | 依赖文件系统事件 |

**防抖机制**：日志变化后 500ms 再采集，避免频繁写入时多次触发。

### 实现方案

```typescript
// packages/cli/src/ingestors/openclaw-ingestor.ts

class OpenClawIngestor {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  async startWatching(db: CorivoDatabase): Promise<void> {
    // 使用 fs.watch 监听日志文件
    this.watcher = watch(this.gatewayLogPath, (eventType) => {
      if (eventType === 'change') {
        this.scheduleIngest();  // 防抖调度
      }
    });
  }

  private scheduleIngest(): void {
    // 防抖：500ms 后执行采集
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.ingest(this.db), 500);
  }
}
```

### 采集规则

**值得保存**：
- 错误日志
- 包含「决定/选择/采用」的决策类内容
- 包含「记住/保存/记录」的记忆类内容
- 问题句式（怎么/如何/?）
- 飞书消息相关（>20字）
- 长句子（>30字，>5个词）

**过滤规则**：
- 太短（<10字）
- test/debug/ping/heartbeat
- 纯标点数字

### 降级方案

如果 `fs.watch` 失败，自动回退到轮询模式：

```typescript
private startPolling(): void {
  this.usePolling = true;
  this.pollTimer = setInterval(() => this.ingest(this.db), 60000);
}
```

### 心跳集成

OpenClaw 采集器在心跳引擎启动时自动启动监听：

```typescript
// packages/cli/src/engine/heartbeat.ts

async start(): Promise<void> {
  // ...
  this.openclawIngestor = new OpenClawIngestor();
  await this.openclawIngestor.startWatching(this.db);
}

async stop(): Promise<void> {
  // ...
  await this.openclawIngestor.stop();
}
```

### OpenClaw Hooks 参考

OpenClaw 的 Hooks 是命令级别的，可用于其他扩展：

| 事件 | 触发时机 |
|------|----------|
| `agent:bootstrap` | 工作区文件注入前 |
| `command:new` | 发出 `/new` 命令 |
| `command:reset` | 发出 `/reset` 命令 |
| `command:stop` | 发出 `/stop` 命令 |
| `gateway:startup` | Gateway 启动 |

### 日志位置

- OpenClaw 日志：`~/.openclaw/logs/gateway.log`
- 采集器日志：`~/.corivo/logs/`（如需调试可添加）
