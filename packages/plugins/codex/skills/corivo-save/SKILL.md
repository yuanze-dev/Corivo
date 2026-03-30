---
name: corivo-save
description: Save durable memory into Corivo when the user asks to remember important information, decisions, preferences, or project facts.
metadata:
  priority: 5
  promptSignals:
    phrases:
      - "remember this"
      - "save this"
      - "note this down"
      - "记一下"
      - "记住这个"
      - "保存这个"
      - "不要忘了"
      - "以后按这个来"
    allOf:
      - [记, 一下]
      - [记住, 这个]
      - [save, this]
      - [remember, this]
    anyOf:
      - "remember"
      - "save"
      - "memory"
      - "记"
      - "保存"
      - "偏好"
    minScore: 5
retrieval:
  aliases:
    - corivo save
    - corivo memory save
    - save to corivo
    - 记到 corivo
  intents:
    - save durable memory
    - remember user preference
    - persist project decision
  entities:
    - corivo
    - corivo save
    - memory preference
---

# Corivo Save

Save durable information into the local Corivo memory runtime.

## When to use

Use this skill when the user says things like:

- "保存这个"
- "记住"
- "记下来"
- "不要忘了"
- "以后按这个来"

Use judgment. Prefer durable facts, instructions, preferences, and decisions over temporary chatter.

## Memory annotation format

Use the annotation format:

```text
性质 · 领域 · 标识
```

### Nature

- `事实`
- `知识`
- `决策`
- `指令`

### Domain

- `self`
- `people`
- `project`
- `asset`
- `knowledge`

## Execution flow

1. Check whether Corivo is installed:

```bash
which corivo || echo "NOT_INSTALLED"
```

If Corivo is missing, tell the user:

```text
[corivo] 首次使用需要安装 Corivo：

npm install -g corivo
corivo init
```

2. Check whether the runtime is initialized:

```bash
corivo status --no-password
```

If it is not initialized, tell the user:

```text
[corivo] 数据库未初始化，请先运行：corivo init
```

3. Restate what you plan to save and propose an annotation.
4. Save the memory:

```bash
corivo save --content "<content>" --annotation "<nature> · <domain> · <tag>" --no-password
```

5. Confirm the result:

```text
[corivo] 已记录：<brief summary>
```

## Guidelines

- Save only information that is likely to matter later.
- Ask before saving if the content is sensitive or ambiguous.
- Prefer a narrow, specific tag over a vague one.
- Do not pretend memory was saved if the command failed.
