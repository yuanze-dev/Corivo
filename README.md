<h1 align="center">Corivo</h1>

<p align="center">
  <strong>A memory companion that lives in your AI workflow</strong><br/>
  <sub>Corivo listens quietly, organizes what matters, and brings context back when it is useful.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corivo"><img src="https://img.shields.io/npm/v/corivo?color=d97706&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d97706" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20arm64-lightgrey" alt="Platform support" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/status-beta-orange" alt="Beta status" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/readme-hero-img.jpeg" alt="Corivo hero image" width="100%" />
</p>

---

## What Corivo Is

Corivo is not another standalone app. It is a background service for people who already work inside AI tools and want continuity across conversations.

It captures decisions, facts, and preferences from ongoing sessions, stores them locally, and surfaces them later with `[corivo]` context prompts.

```text
You:    Remember we prefer TypeScript for backend services.
Agent:  [corivo] Saved.

...two weeks later...

You:    What should we use for this service?
Agent:  [corivo] You previously chose TypeScript for backend services.
```

Today, the strongest supported path is the local `corivo` CLI plus the Claude Code integration. Other integrations in this repository are either early-stage or experimental.

## Current Status

Corivo is in active beta. The project is usable today, but still evolving quickly.

| Area | Status |
|---|---|
| `corivo` CLI (`packages/cli`) | Beta, primary entry point |
| Local memory engine (SQLite + heartbeat) | Available |
| Claude Code integration | Available |
| Sync relay (`packages/solver`) | Early-stage package |
| Codex / OpenClaw plugin packages | Experimental package surface |
| Official platform support | macOS arm64 first |

## Quick Start

Install with npm:

```bash
npm install -g corivo
corivo init
```

Typical first commands:

```bash
corivo status
corivo save --content "Use PostgreSQL for billing" --annotation "决策 · project · database"
corivo query "database"
corivo inject
```

Notes:
- `corivo inject` writes Corivo rules into `.claude/CLAUDE.md` in your current project.
- The local CLI is the main product surface today.
- `scripts/install.sh` now installs the Codex local plugin entry as well, including marketplace registration and enabling the `plugins` feature in `~/.codex/config.toml`.
- Some integrations shown in the repository are still in progress or experimental.

## Why It Exists

AI tools are good at the current conversation and bad at continuity.

Corivo is built for the gap in between: the preferences you repeat, the decisions you already made, the facts that should not vanish between sessions, and the project context that should come back before you ask for it again.

## How It Works

```text
AI tools (Claude Code / others)
        |
        v
Ingestors + cold scan
        |
        v
Corivo database (~/.corivo/corivo.db)
Blocks + associations + query logs
        |
        v
Heartbeat engine
- annotation
- vitality decay
- association discovery
- consolidation
        |
        v
CLI commands and optional sync
```

Memory is modeled as blocks with vitality (`active -> cooling -> cold -> archived`). Decisions decay slower than lightweight knowledge, so long-lived project choices remain easier to recover.

| Package | Description |
|---------|-------------|
| [`@corivo/cli`](packages/cli) | Core CLI, local database, heartbeat engine |
| [`@corivo/solver`](packages/solver) | CRDT sync relay server (Fastify v5) |
| [`@corivo/claude-code`](packages/plugins/claude-code) | Claude Code plugin integration |
| [`@corivo/cursor`](packages/plugins/cursor) | Cursor hook adapter for active memory |
| [`@corivo/opencode`](packages/plugins/opencode) | OpenCode plugin adapter for active memory |
| [`@corivo/codex`](packages/plugins/codex) | Codex instruction-driven active memory integration |

Each public-facing package now has its own README so contributors can orient themselves without reverse-engineering the tree.

## Privacy and Data Ownership

Corivo is local-first by default.

- Data is stored in `~/.corivo/` on your machine.
- SQLite is used for persistence, with optional SQLCipher and fallback application-layer encryption.
- No telemetry pipeline is required for core local usage.
- Network behavior is mainly tied to optional sync workflows.

## Development

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
pnpm install
pnpm build
```

Useful workspace commands:

```bash
pnpm dev
pnpm lint
pnpm test
```

Package-level examples:

```bash
cd packages/cli
npm run build
npm run test

cd ../solver
npm run dev
```

## Contributing and Community

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Beta notes: [BETA.md](BETA.md)
- Issue tracker: [github.com/xiaolin26/Corivo/issues](https://github.com/xiaolin26/Corivo/issues)

Clear bug reports, docs improvements, tests, and integration work are all welcome.

## Roadmap Snapshot

- Improve plugin stability and cross-tool ingestion coverage
- Expand support beyond macOS arm64
- Continue tightening sync reliability and operational docs
- Add a clearer external API story for ecosystem contributors

## License

Corivo is released under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built for humans who work with AI every day.</sub>
</p>
