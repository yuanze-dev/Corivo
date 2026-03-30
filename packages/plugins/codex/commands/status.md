---
description: Show Corivo memory health, initialization state, and current block counts.
---

# Corivo Status

Inspect the local Corivo runtime before relying on saved memory.

## Preflight

1. Check `which corivo`.
2. If missing, stop and show the install command.
3. Run `corivo status --no-password` and capture both stdout and stderr.

## Plan

1. Read the current Corivo runtime status.
2. Detect whether the database is ready, empty, or unavailable.
3. Present a concise operational summary.

## Commands

```bash
which corivo
corivo status --no-password
```

## Verification

1. Confirm the status command returned without interactive prompts.
2. If initialized, extract and summarize useful counts from the output.
3. If not initialized, clearly state that and do not invent metrics.

## Summary

Present:

- Installation state
- Initialization state
- Memory counts or health summary when available

## Next Steps

- Suggest `/corivo:init` if initialization is missing.
- Suggest `/corivo:query` before answering history-dependent questions.
