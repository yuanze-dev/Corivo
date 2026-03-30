---
description: Save durable information into Corivo with a deliberate annotation.
---

# Corivo Save

Record durable user or project memory into Corivo.

## Preflight

1. Verify `corivo` is available.
2. Verify the database is initialized with `corivo status --no-password`.
3. Restate what will be saved and propose the annotation before executing.
4. If the content looks temporary or sensitive in a risky way, pause and ask before saving.

## Plan

1. Classify the memory as `事实`, `知识`, `决策`, or `指令`.
2. Choose a domain such as `self`, `people`, `project`, `asset`, or `knowledge`.
3. Save the memory with `corivo save`.
4. Confirm the save result back to the user.

## Commands

```bash
corivo status --no-password
corivo save --content "<content>" --annotation "<nature> · <domain> · <tag>" --no-password
```

## Verification

1. Confirm the save command exits successfully.
2. If possible, run a targeted `corivo query` to confirm the memory can be recalled.
3. Report the stored annotation and a brief summary, not the full raw shell output.

## Summary

Present:

- What was saved
- Which annotation was used
- Whether verification succeeded

## Next Steps

- Suggest `/corivo:query` when the user wants to reuse this memory later.
- Suggest refining the annotation if the saved memory is too broad.
