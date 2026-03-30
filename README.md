<h1 align="center">Corivo</h1>

<p align="center">
  <strong>The memory layer for your AI-assisted workflow</strong><br/>
  <sub>Lives inside Claude Code, Cursor, and Feishu — remembers everything you say</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corivo"><img src="https://img.shields.io/npm/v/corivo?color=d97706&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d97706" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20arm64-lightgrey" alt="macOS" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/status-beta-orange" alt="Beta" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="docs/images/readme-hero-img.jpeg" alt="Corivo — Your Silicon Colleague" width="100%" />
</p>


---

## What is Corivo?

Corivo is a **background memory companion** that lives inside the tools you already use — Claude Code, Cursor, and Feishu. It quietly listens to your AI conversations, remembers what matters, and surfaces relevant context at the right moment.

No new app to learn. No workflow to change. It just works.

```
You:    Remember, I prefer TypeScript over JavaScript.
Claude: [corivo] Got it.

— 3 weeks later —

You:    What language should I use for this new module?
Claude: [corivo] You've mentioned preferring TypeScript before.
```

---

## Features

| | |
|---|---|
| **Passive Listening** | Captures decisions, facts, and preferences from your AI conversations automatically |
| **Structured Memory** | Classifies memories into *decisions*, *facts*, *knowledge*, and *preferences* |
| **Vitality Decay** | Memories age naturally — critical decisions fade slower than casual notes |
| **Association Engine** | Discovers relationships between memories (similar, conflicts, supersedes…) |
| **Full-Text Search** | Instant recall with FTS5; graceful fallback to LIKE-search for CJK text |
| **End-to-End Encrypted** | All data stored locally in `~/.corivo/` with optional SQLCipher encryption |
| **Multi-Device Sync** | CRDT-based sync server for seamless cross-machine memory |
| **CLI First** | Every feature accessible via a clean command-line interface |

---

## Quick Start

### One-line install

```bash
curl -fsSL https://corivo.ai | sh
```

This will:
1. Install the `corivo` CLI globally
2. Scan your environment (Git config, project settings, AI tool configuration)
3. Build your initial memory profile
4. Start the background heartbeat daemon
5. Inject Corivo rules into Claude Code

### Or via npm

```bash
npm install -g corivo
corivo init
```

### Inject into your project

```bash
cd your-project
corivo inject   # writes Corivo rules into .claude/CLAUDE.md
```

---

## Usage

### In conversation (Claude Code)

```
You:    Remember, Sarah is our backend lead.
Claude: [corivo] Saved.

You:    Who's handling the backend?
Claude: [corivo] Sarah — she's your backend lead.
```

```
You:    We decided to go with React instead of Vue.
Claude: [corivo] Recorded: frontend framework → React

You:    Why did we pick React again?
Claude: [corivo] Your team has more React experience.
```

### CLI

```bash
# Save a memory
corivo save --content "Use PostgreSQL for the main DB" \
            --annotation "决策 · project · database"

# Query your memories
corivo query "database"

# Check memory status
corivo status

# Push context to AI session
corivo push

# View daemon logs
corivo logs
```

---

## Memory Types

| Type | Description | Example |
|------|-------------|---------|
| **Decision** | Choices you've made | "We use PostgreSQL", "TypeScript over JS" |
| **Fact** | Facts about people or projects | "Sarah is the backend lead" |
| **Knowledge** | Things you've learned | "React hooks pattern", "Deployment flow" |
| **Preference** | Your habits and style | "2-space indent", "concise code" |

Memories carry a **vitality score** (0–100) that decays over time. Decisions decay slowest; casual knowledge fades faster. Status cycles: `active → cooling → cold → archived`.

---

## Architecture

```
Claude Code / Cursor / Feishu
        │
        ▼
  Ingestors / Cold Scan          ← harvest raw signals
        │
        ▼
  CorivoDatabase                 ← better-sqlite3, ~/.corivo/corivo.db
  (Blocks · Associations · Query Logs)
        │
        ▼
  Heartbeat Engine (every 5s)
  ├── processPendingBlocks   → RuleEngine annotation
  ├── processVitalityDecay   → type-aware decay
  ├── processAssociations    → link discovery (every 30s)
  └── processConsolidation   → dedup + summarize (every 1min)
        │
        ▼
  CLI Commands · CRDT Sync Server
```

### Packages

| Package | Description |
|---------|-------------|
| [`@corivo/cli`](packages/cli) | Core CLI, local database, heartbeat engine |
| [`@corivo/solver`](packages/solver) | CRDT sync relay server (Fastify v5) |
| [`@corivo/claude-code`](packages/plugins/claude-code) | Claude Code plugin integration |
| [`@corivo/cursor`](packages/plugins/cursor) | Cursor hook adapter for active memory |
| [`@corivo/opencode`](packages/plugins/opencode) | OpenCode plugin adapter for active memory |
| [`@corivo/codex`](packages/plugins/codex) | Codex instruction-driven active memory integration |

---

## Data & Privacy

- All data lives in **`~/.corivo/`** on your own machine
- SQLite database with optional **SQLCipher** encryption; falls back to application-layer encryption (`KeyManager`) if SQLCipher is unavailable
- No telemetry, no analytics, no cloud — unless you opt in to multi-device sync

```
~/.corivo/
├── corivo.db       # encrypted memory store
├── config.json     # your settings
└── identity.json   # device fingerprint (no password required)
```

---

## Development

```bash
git clone https://github.com/xiaolin26/Corivo.git
cd Corivo
npm install

# Build all packages
npm run build

# Work on a specific package
cd packages/cli
npm run dev          # watch mode

# Run tests (cli package)
cd packages/cli
node --test          # all tests
node --test __tests__/unit/database.test.ts
```

### Tech Stack

- **Runtime**: Node.js ≥ 18, pure ESM TypeScript (ES2022)
- **Database**: better-sqlite3 (WAL mode, FTS5)
- **Sync Server**: Fastify v5, CRDT changesets
- **Auth**: Challenge-Response + Bearer Token
- **ORM**: Drizzle ORM (type-safe queries)
- **Daemon**: macOS launchd

---

## Roadmap

- [x] Claude Code integration
- [x] Local SQLite memory with vitality decay
- [x] Association engine
- [x] CRDT sync server
- [x] Drizzle ORM type-safe schema
- [ ] Cursor integration
- [ ] Feishu integration
- [ ] Linux & Windows support
- [ ] Web dashboard
- [ ] Team / enterprise features

---

## Beta Program

Corivo v0.11 is in limited beta on **macOS arm64**.

[Join the beta →](BETA.md) · [File an issue →](https://github.com/xiaolin26/Corivo/issues)

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes following [conventional commits](https://www.conventionalcommits.org)
4. Push and open a PR against `main`

---

## License

Corivo Core is open-source under the **[MIT License](LICENSE)**.

Enterprise and team features (planned) will be available under a commercial license.

---

<p align="center">
  <sub>Built for humans who work with AI every day · v0.11.0</sub>
</p>
