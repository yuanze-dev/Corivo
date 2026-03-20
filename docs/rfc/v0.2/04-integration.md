# 04 · 接入架构

> Corivo 设计文档 v1.0 · [返回索引](./README.md)

---

## 设计原则

Corivo 不是独立 App，而是嵌入用户已有工具的记忆层。用户不需要"打开 Corivo"，它在 Claude Code、Cursor、飞书的使用过程中自动工作。

---

## 四层架构

```
┌───────────────────────────────────────────────────────┐
│                    Corivo Core                        │
│          (本地 SQLCipher + Agent 操作逻辑)              │
└───┬──────────────┬───────────────┬──────────────┬─────┘
    │              │               │              │
 规则注入       corivo CLI     MCP Server     IM Bridge
    │              │               │              │
 ┌──┴──┐     ┌────┴────┐    ┌────┴────┐    ┌────┴─────┐
 │CLAUDE│     │Claude   │    │Claude.ai│    │ 飞书/Lark │
 │.md   │     │Code     │    │ChatGPT  │    │ Telegram  │
 │agent │     │Codex    │    │Cursor   │    │ Discord   │
 │.md   │     │终端脚本  │    │VS Code  │    │ Slack     │
 └──────┘     └─────────┘    └─────────┘    └──────────┘
```

### 第零层：规则注入（最轻量）

往用户已有的 CLAUDE.md / agent.md / .cursorrules 中注入一段 Corivo 使用规则。AI 工具读到规则后自动调用 `corivo save` / `corivo query`。

- 零额外进程、零协议依赖
- AI 工具自己就是采集器和查询端
- 需要用户授权每个文件的注入（详见 05-ingestion.md 透明度设计）

### 第一层：CLI（核心接口）

本地命令行工具，直接操作 SQLCipher。所有上层接口最终都调用这一层。

```bash
corivo save --content "选型确定用 SQLCipher" --annotation "决策 · project · corivo"
corivo query "数据库选型"
corivo query --annotation "决策" --after "2026-03-01"
corivo update blk_a3f29x --content "新内容"
corivo link blk_a3f29x blk_b2e18w
corivo list --limit 20 --sort updated
```

CLI 是核心，因为：Claude Code / Codex 等 CLI Agent 直接执行 shell 命令；本地执行无需网络；最容易被测试、脚本化、社区扩展。

### 第二层：MCP Server（标准协议）

将 CLI 包装为 MCP 协议的 Tools 和 Resources，供 Claude Desktop、Cursor、VS Code 等 GUI 工具调用。同时承载心跳引擎（详见 06-heartbeat.md）。

| Tool | 对应 CLI | 说明 |
|------|---------|------|
| `corivo.save` | `corivo save` | 写入新 block |
| `corivo.query` | `corivo query` | 语义 + 结构化查询 |
| `corivo.update` | `corivo update` | 更新已有 block |
| `corivo.delete` | `corivo delete` | 归档 block |
| `corivo.link` | `corivo link` | 建立/移除 refs |

配置方式（Claude Desktop 示例）：

```json
{
  "mcpServers": {
    "corivo": {
      "command": "corivo",
      "args": ["mcp-server"]
    }
  }
}
```

### 第三层：IM Bridge（消息平台桥接）

飞书、Telegram 等不支持 MCP，通过轻量 daemon 桥接。同时承担消息采集和主动推送职责。

```
用户 (飞书/Telegram/Slack)
  ↕ Bot API
Bridge Daemon (Node.js)
  ↕ corivo CLI
本地 SQLCipher
```

Bridge 职责极简：监听消息 → 调 CLI → 格式化回复。核心逻辑全在 CLI 层。

---

## 设计决策

**为什么规则注入是第零层？** 它的接入成本最低——一段文本写入已有文件。不需要配 MCP、不需要起进程。而且注入后 AI 工具不只是被动被采集，而是主动使用 Corivo 的全部能力。

**为什么 CLI 是核心而非 MCP？** CLI Agent 调 shell 命令比调 MCP 更快更轻。CLI 是最低公约数，MCP 和 IM Bridge 都是 CLI 的薄包装。

**为什么不为每个平台写独立集成？** 维护成本随平台数线性增长。四层架构下，core + CLI 只有一份代码，每个上层适配器都是几百行的薄壳。
