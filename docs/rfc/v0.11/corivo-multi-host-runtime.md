# Corivo Multi-Host Runtime

## 目标

把已经在 Claude Code 上跑通的主动记忆体验，扩展到三个宿主：

- Codex
- OpenCode
- Cursor

目标不是三套不同逻辑，而是同一个 Corivo runtime，配三个不同宿主 adapter。

## 三宿主当前策略

### Cursor

定位：`full-hook` + `instruction-driven` hybrid host

原因：

- 本机 Cursor 侧可以承载 Claude 风格 hook 生命周期
- 但为了降低静默失效风险，同时注入全局规则文件
- 目标仍然是：
  - `SessionStart`
  - `UserPromptSubmit`
  - `Stop`

策略：

- 安装 Cursor 全局规则文件
- 安装本机 hook 脚本并写入 `~/.cursor/settings.json`
- 允许 Cursor CLI 运行 `corivo`
- carry-over / recall / review 都由 Corivo CLI runtime 决定

### OpenCode

定位：`plugin-transform` host

原因：

- 本机 OpenCode 有原生 plugin API
- 可观察聊天消息、session 事件，并能改写系统提示

策略：

- 用原生 plugin 适配器
- `session.created` -> carry-over
- `chat.message` -> recall
- `message.updated` / `session.idle` -> review
- 对相同 assistant 文本做 review 去重，避免重复触发

### Codex

定位：`instruction-driven` host

原因：

- 本机 Codex 没有找到 Claude 那种 prompt lifecycle hook
- 但有：
  - 全局 AGENTS / 技能
  - `notify`
  - 持久 session/state 文件

策略：

- 通过 Codex 指令模板引导模型主动调用 carry-over / recall / review
- 通过 notify 适配器做答后补充和后台处理

## 统一原则

1. runtime 逻辑不复制
2. 宿主只做事件转发和结果注入
3. 用户应能感知 Corivo
4. 若模型采纳记忆，回答中尽量显式说出“根据 Corivo 的记忆”
