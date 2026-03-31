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
| Host integration bundles + runtime plugins | Mixed maturity by package |
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
corivo host list
corivo inject
```

Notes:
- `corivo host list` shows the supported host integrations managed by the CLI.
- `corivo host install <host>` is the primary host-management entry point.
- `corivo inject` remains available as a compatibility alias for project/global Claude-style installation flows.
- The local CLI is the main product surface today.
- `scripts/install.sh` can detect and configure Claude Code, Codex, Cursor, and OpenCode on the same machine.
- Some integrations shown in the repository are still in progress or experimental.

## Single Installation Path

Corivo keeps one installation control path: the local `corivo` CLI.

- `scripts/install.sh` is the one-command bootstrap entry that installs and then delegates to CLI flows.
- `corivo inject --global --<host>` is the stable host install entry for Claude Code, Codex, and Cursor.
- OpenCode install is handled by `corivo inject --global --opencode`, which installs the packaged runtime asset from `packages/plugins/runtime/opencode/assets/corivo.ts`.
- Host packages under `packages/plugins/hosts/*` are host integration bundles consumed by the CLI installer where host assets are CLI-backed.
- `packages/plugins/hosts/opencode` is currently a reserved host boundary and is not CLI asset-backed in this stage.
- Runtime packages under `packages/plugins/runtime/*` are executable runtime plugins; they are not host installers.

This boundary exists so install behavior stays centralized while host/runtime packaging evolves.
## Install by Host

Corivo supports multiple AI coding agents. You can either use the one-command installer to auto-detect local hosts, or install a specific host adapter yourself.

### One-command installer

```bash
curl -fsSL https://i.corivo.ai/install.sh | bash
```

This installer:

- installs Node.js if it is missing
- installs the `corivo` CLI
- runs `corivo init`
- detects Claude Code, Codex, Cursor, and OpenCode on your machine
- installs the matching Corivo host adapters automatically

### Claude Code

What you get:

- Claude Code hooks for carry-over, recall, and review
- Corivo skills and command docs for Claude Code workflows
- global Claude Code host wiring through the Corivo CLI

Install:

```bash
corivo host install claude-code
# compatibility alias:
corivo inject --global --claude-code
```

What the installer does:

- installs Claude Code hook scripts and skills
- updates Claude Code settings so lifecycle hooks call Corivo
- enables the primary Corivo active-memory flow for Claude Code

Notes:

- This is the most mature integration in the repository today.
- Use the one-command installer if you want Claude Code to be configured automatically when detected.

### Codex

What you get:

- global Codex active-memory instructions
- notify adapter wiring for post-response review
- local plugin assets and marketplace-ready packaging in this repository

Install:

```bash
corivo host install codex
# compatibility alias:
corivo inject --global --codex
```

What the installer does:

- writes the global Codex Corivo instructions
- installs the Codex notify adapters under `~/.codex/corivo/`
- updates Codex global configuration so Corivo participates in the active-memory flow

Notes:

- Restart Codex after installation so the new configuration takes effect.
- The one-command installer will configure Codex automatically if it detects `codex` or `~/.codex`.

### Cursor

What you get:

- global Cursor rules for carry-over, recall, and review
- native Cursor lifecycle hook wiring
- CLI permission setup so Cursor can call `corivo`

Install:

```bash
corivo host install cursor
# compatibility alias:
corivo inject --global --cursor
```

What the installer does:

- writes the global `corivo.mdc` rule file
- installs Corivo hook scripts under `~/.cursor/corivo/`
- updates `~/.cursor/settings.json` with Cursor lifecycle hooks
- ensures Cursor CLI permissions allow `Shell(corivo)`

Notes:

- If Cursor Agent is installed but not logged in yet, the installer will report that extra attention is required.
- The one-command installer will configure Cursor automatically if it detects `cursor` or `~/.cursor`.

### OpenCode

What you get:

- an OpenCode plugin that maps native OpenCode events to Corivo memory flows
- carry-over, recall, and review integration through the local Corivo CLI

Install:

```bash
corivo host install opencode
# compatibility alias:
corivo inject --global --opencode
```

What the installer does:

- installs a local `corivo.ts` plugin into `~/.config/opencode/plugins/`
- installs a local `corivo.ts` plugin into `~/.config/opencode/plugins/` from the packaged runtime asset path
- connects native OpenCode events to Corivo carry-over, recall, and review calls

Notes:

- The installer may ask you to verify your default OpenCode provider configuration after setup.
- The one-command installer will configure OpenCode automatically if it detects `opencode` or `~/.config/opencode`.

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

## Plugin Directory Model

Corivo uses a two-boundary plugin tree:

- `packages/plugins/hosts/*`: packaged host integration bundles (hooks, skills, templates, assets, adapter scripts).
- `packages/plugins/runtime/*`: executable runtime plugins (TypeScript code, runtime event adapters, build/testable packages).

Host integration bundles define install surfaces for host environments. Runtime plugins define runtime behavior. They are complementary but distinct.

| Package | Description |
|---------|-------------|
| [`@corivo/cli`](packages/cli) | Core CLI, local database, heartbeat engine |
| [`@corivo/solver`](packages/solver) | CRDT sync relay server (Fastify v5) |
| [`@corivo/claude-code`](packages/plugins/hosts/claude-code) | Claude Code host integration bundle |
| [`@corivo/cursor`](packages/plugins/hosts/cursor) | Cursor host integration bundle |
| [`@corivo/codex`](packages/plugins/hosts/codex) | Codex host integration bundle |
| [`hosts/opencode`](packages/plugins/hosts/opencode) | Reserved OpenCode host boundary (not CLI asset-backed in this stage) |
| [`@corivo/opencode`](packages/plugins/runtime/opencode) | OpenCode executable runtime plugin |
| [`@corivo/openclaw`](packages/plugins/runtime/openclaw) | OpenClaw executable runtime plugin |

Each public-facing package now has its own README so contributors can orient themselves without reverse-engineering the tree.

### Host Management

Corivo now separates host integration management from legacy injection aliases.

Primary commands:

```bash
corivo host list
corivo host install codex
corivo host doctor cursor
corivo host uninstall opencode
```

Compatibility aliases still exist:

```bash
corivo inject
corivo inject --global --codex
corivo inject --global --cursor
corivo inject --global --opencode
corivo inject --global --claude-code
```

Internally, the `host` command and the legacy `inject` alias both route through the same host registry and host install/doctor/uninstall use cases.

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
