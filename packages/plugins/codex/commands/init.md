---
description: Initialize Corivo in the current environment and verify the local memory runtime is ready.
---

# Corivo Init

Bootstrap Corivo for the current machine or workspace.

## Preflight

1. Check whether `corivo` is on `PATH` with `which corivo`.
2. If missing, tell the user to install it with `npm install -g corivo`.
3. Run `corivo status` to see whether the database is already initialized.
4. If the current repo is not the intended workspace, stop and ask the user before making changes.

## Plan

1. Install guidance if the CLI is missing.
2. Run `corivo init` only when the runtime is not initialized yet.
3. Re-run `corivo status` to confirm readiness.

## Commands

```bash
which corivo
corivo status
corivo init
corivo status
```

## Verification

1. Confirm `corivo status` exits successfully.
2. Confirm the output no longer says the database is uninitialized.
3. Summarize total and active memory counts if available.

## Summary

Report:

- Whether Corivo was already installed
- Whether initialization was needed
- The final runtime status

## Next Steps

- Suggest `/corivo:status` to inspect memory health.
- Suggest `/corivo:save` after the user shares durable information worth remembering.
