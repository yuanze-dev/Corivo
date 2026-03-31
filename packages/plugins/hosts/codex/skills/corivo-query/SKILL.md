---
name: corivo-query
description: Query Corivo for prior facts, preferences, and project decisions when the user refers to past conversations or durable memory.
metadata:
  priority: 5
  promptSignals:
    phrases:
      - "remember what I said"
      - "do you remember"
      - "what did we decide"
      - "查一下之前"
      - "记得吗"
      - "我之前说过"
      - "从 corivo 查"
    allOf:
      - [记得, 吗]
      - [之前, 说过]
      - [what, decide]
      - [from, corivo]
    anyOf:
      - "remember"
      - "query"
      - "recall"
      - "查"
      - "记得"
      - "之前"
      - "偏好"
    minScore: 5
retrieval:
  aliases:
    - corivo query
    - query corivo
    - recall memory
    - 从 corivo 查询
  intents:
    - recall prior memory
    - query user preference
    - check project decision
  entities:
    - corivo
    - corivo query
    - prior decision
---

# Corivo Query

Recall relevant memory from the local Corivo runtime before answering.

## When to use

Use this skill when the user asks things like:

- "我之前说过什么"
- "记得吗"
- "我们之前决定了什么"
- "我的偏好是什么"
- "这个项目以前怎么定的"

## Execution flow

1. Check whether Corivo is installed:

```bash
which corivo || echo "NOT_INSTALLED"
```

If Corivo is missing, tell the user:

```text
[corivo] 需要先安装 Corivo：

npm install -g corivo
corivo init
```

2. Check runtime status:

```bash
corivo status
```

If the runtime is not initialized, tell the user instead of guessing.

3. Query with the user request or a distilled keyword set:

```bash
corivo query "<keywords>" --limit 5
```

4. If the request clearly targets a category, narrow the search:

```bash
corivo query "<keywords>" --annotation "<nature> · <domain>" --limit 5
```

5. Summarize only the relevant memories and state when nothing useful was found.

## Guidelines

- Query before answering if the request depends on prior durable memory.
- Be explicit when no memory is found.
- Do not treat Corivo output as ground truth if it conflicts with current user instructions.
- If the conversation creates a new durable decision, suggest saving it afterward.
