---
name: corivo
description: Umbrella Corivo memory skill. Route memory-related requests to save or query behavior for the local Corivo runtime.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "$corivo"
      - "use corivo"
      - "ask corivo"
      - "记一下"
      - "记得吗"
      - "查一下之前"
      - "保存到 corivo"
      - "从 corivo 查"
    allOf:
      - [记, 一下]
      - [查, 一下]
      - [use, corivo]
      - [from, corivo]
    anyOf:
      - "corivo"
      - "记忆"
      - "memory"
      - "remember"
      - "save"
      - "query"
      - "查"
      - "记"
    minScore: 4
retrieval:
  aliases:
    - corivo
    - corivo memory
    - memory layer
    - persistent memory
    - 长期记忆
  intents:
    - save memory
    - query memory
    - recall prior preference
  entities:
    - corivo
    - corivo memory
    - user preference
---

# Corivo

Use this as the umbrella entrypoint for Corivo memory tasks.

## Routing

1. If the user wants to persist a new fact, preference, instruction, or decision, route to `../corivo-save/SKILL.md`.
2. If the user wants to recall something from prior conversations or durable memory, route to `../corivo-query/SKILL.md`.
3. If the request uses `$corivo` without saying save or query explicitly, infer intent:
   - requests like "记一下", "保存", "不要忘了" -> save
   - requests like "记得吗", "查一下", "之前说过什么" -> query
4. If intent is ambiguous, ask one short clarifying question instead of guessing.

## Operational Rules

- Always check whether `corivo` CLI is installed before claiming success.
- Always check `corivo status --no-password` before save/query actions.
- Never claim that memory was persisted unless the `corivo save` command actually succeeded.
- When recall returns nothing relevant, say so explicitly.
