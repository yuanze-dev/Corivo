# Corivo for OpenCode

OpenCode active memory adapter for Corivo.

## Lifecycle Mapping

- `session.created` -> `corivo carry-over`
- `chat.message` -> `corivo recall`
- `session.idle` -> `corivo review`

## Injection Strategy

The plugin keeps host logic thin:

- it reacts to native OpenCode events
- it delegates memory decisions to the Corivo CLI runtime
- it injects returned `hook-text` into the OpenCode system context

The goal is Claude-Code-like visible memory behavior without scraping OpenCode's internal SQLite database.
