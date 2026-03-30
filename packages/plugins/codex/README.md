# Corivo for OpenAI Codex

Your Cyber Partner — Persistent memory for Codex CLI.

## Installation

### Prerequisites

```bash
npm install -g corivo
corivo init
```

### Install Skills

```bash
# 使用 Codex skill installer
$skill-installer corivo

# 或手动复制到 ~/.codex/skills/corivo/
```

### Configure

Add to `~/.codex/config.toml`:

```toml
[[skills.config]]
path = "~/.codex/skills/corivo/SKILL.md"
enabled = true
```

For active-memory parity, also inject Corivo instructions into Codex global agents:

```bash
corivo inject --global --codex
```

Optional post-response adapter:

```toml
notify = ["bash", "~/.codex/skills/corivo/adapters/notify-review.sh"]
```

## Usage

### Save

```
You: Remember that I prefer 2-space indentation
Codex: [corivo] 已记录：代码风格偏好
```

### Query

```
You: What did I say about code style?
Codex: [corivo] 找到 1 条相关记忆:
       你喜欢 2 空格缩进
```

### Active Memory

Codex integration is instruction-driven:

- session/task start -> `corivo carry-over`
- before history-sensitive answers -> `corivo recall`
- after substantive answers -> `corivo review`

If Codex adopts surfaced memory, it should explicitly say “根据 Corivo 的记忆” or similar.

## License

MIT
