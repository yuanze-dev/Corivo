# Corivo for OpenAI Codex

Your Cyber Partner — Persistent memory for Codex CLI.

## Installation

### Prerequisites

```bash
npm install -g corivo
corivo init
```

### Install Active Memory

```bash
corivo inject --global --codex
```

The global Codex injector also installs the Corivo notify adapters into `~/.codex/corivo/`
and rewires `notify` through a dispatch script so Corivo can participate in post-response review
without clobbering your existing notifier.

Codex active memory is instruction-driven plus notify-assisted; there is no separate packaged
`SKILL.md` install target in this package.

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
