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

## License

MIT
