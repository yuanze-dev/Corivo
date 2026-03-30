---
description: Query Corivo for prior facts, preferences, and project decisions relevant to the current task.
---

# Corivo Query

Recall relevant memory from Corivo before answering.

## Preflight

1. Verify `corivo` is available.
2. Verify the runtime is initialized.
3. Turn the user request into a search query or annotation filter.

## Plan

1. Query Corivo with the user prompt or a distilled keyword set.
2. If the request implies a category like project decisions or user preferences, narrow with `--annotation`.
3. Summarize only the relevant results.

## Commands

```bash
corivo status --no-password
corivo query "<keywords>" --limit 5 --no-password
corivo query "<keywords>" --annotation "<nature> · <domain>" --limit 5 --no-password
```

## Verification

1. Confirm the query runs without prompting for secrets.
2. State whether any relevant memories were found.
3. If nothing is found, say so explicitly instead of guessing.

## Summary

Present:

- Query strategy used
- Number of relevant memories found
- The few memories that materially affect the answer

## Next Steps

- Suggest `/corivo:save` if the answer creates a new durable decision or instruction.
- Suggest refining keywords or annotation filters if recall was noisy.
