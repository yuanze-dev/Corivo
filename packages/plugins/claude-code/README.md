# Corivo Claude Code Plugin

Your Cyber Partner — Persistent memory for Claude Code. Automatically saves and retrieves important information from your conversations.

## Features

- **Save Memories** - Store important information from conversations
- **Query Memories** - Retrieve previously saved information with full-text search
- **Status Display** - View memory statistics in the status bar

## Installation

### Prerequisites

1. Install Corivo CLI first:
```bash
npm install -g corivo
corivo init
```

2. Install the plugin in Claude Code:
```
/plugin install xiaolin26/corivo
```

## Use Cases

### 1. Remember Your Preferences

Claude can remember your coding style, preferences, and settings:

```
You: I prefer 2-space indentation and camelCase for function names
Claude: [corivo] Saving your coding preferences...
```

Later sessions:
```
You: How should I format this code?
Claude: Based on your saved preferences, I'll use 2-space indentation and camelCase...
```

### 2. Track Project Decisions

Never forget why you made a technical choice:

```
You: We chose React over Vue because the team is more familiar with it
Claude: [corivo] Recording this decision...

You: Why did we pick this library again?
Claude: [corivo] Found memory: You chose React over Vue because...
```

### 3. Store Team Knowledge

Build a knowledge base from your daily conversations:

```
You: The API endpoint for user profiles is /api/users/:id
Claude: [corivo] Saving API documentation...

You: What's the endpoint for getting user data?
Claude: [corivo] According to saved knowledge: /api/users/:id
```

### 4. Remember People Information

Keep track of colleagues, contacts, and their roles:

```
You: Sarah is the backend lead, she prefers Go for services
Claude: [corivo] Saving team member info...
```

### 5. Document Workflow Processes

Save complex procedures you use often:

```
You: To deploy: run tests, build Docker image, push to registry, then update k8s
Claude: [corivo] Saving deployment process...
```

## Usage Examples

### Saving Memories

Triggered by phrases like:
- "Save this"
- "Remember that"
- "Don't forget"
- "Note this down"

```
You: Remember that I use zsh on macOS
Claude: I'll save this information:
       Type: Fact (about you)
       Category: self

       [corivo] Saved: Your shell preference
```

### Querying Memories

Triggered by phrases like:
- "What did I say about..."
- "Do you remember..."
- "We decided..."
- "What's my preference on..."

```
You: What did we decide about the database?
Claude: Let me check previous decisions...

       [corivo] Found 1 memory:
       You chose PostgreSQL for better JSON support and ACID compliance.

       You selected PostgreSQL because you need strong JSON support and transactional integrity.
```

### Memory Types

| Type | Description | Examples |
|------|-------------|----------|
| **Fact** | Objective, verifiable info | Birthdays, server configs, API keys |
| **Knowledge** | Learned concepts | How React hooks work, deployment flows |
| **Decision** | Technical choices | Using PostgreSQL, choosing TypeScript |
| **Instruction** | User preferences | Code style, naming conventions |

### Memory Format

```
{Type} · {Domain} · {Tag}

Examples:
- 事实 · self · 个人信息      (Fact · self · personal)
- 决策 · project · 前端框架    (Decision · project · frontend)
- 知识 · knowledge · API      (Knowledge · knowledge · API)
- 指令 · self · 代码风格      (Instruction · self · coding-style)
```

## Status Bar

The status bar shows:
- **Total blocks** - Number of memories stored
- **Health** - Database health percentage
- **States** - Active / Cooling / Frozen memory counts

```
corivo: 42 blocks | 85% healthy | 38 active
```

## Runtime Flow

Claude Code integration now uses three visible memory runtime paths:

- **Carry-over**: at session start, bring back one unfinished or recently shifted memory
- **Recall**: on user prompt submit, try to surface historical context before Claude answers
- **Review**: after Claude answers, optionally add a short follow-up or correction

This keeps hook scripts thin and moves trigger / retrieval / ranking logic into the local `corivo` CLI.

## Skills

### corivo-save
Saves information to the Corivo memory database.

**Usage:**
- Say "save this" or "remember" during conversation
- Claude will categorize and store the information
- Automatic type detection based on content

### corivo-query
Queries the Corivo memory database.

**Usage:**
- Ask "what did I say about..." or "do you remember..."
- Full-text search across all memories
- Filter by type (decision, fact, knowledge, instruction)

### corivo runtime hooks
Automatic lifecycle surfacing for Claude Code.

**Flow:**
- `SessionStart` → status summary + carry-over
- `UserPromptSubmit` → ingestion + recall
- `Stop` → ingestion + review

## Configuration

Corivo uses `~/.corivo/` directory:
- `corivo.db` - SQLite database (encrypted)
- `config.json` - Plugin configuration

## Advanced Queries

```bash
# Search by keyword
corivo query "React" --limit 10

# Filter by type (decisions only)
corivo query "" --annotation "决策 · project" --limit 5

# Check status
corivo status --no-password
```

## Privacy & Security

- All data stored locally on your machine
- Encrypted database with AES-256-GCM
- No data sent to external servers
- Full control over your memories

## Development

```bash
# Build
npm run build

# Test
npm test

# Format
npm run format
```

## License

MIT

## Links

- [GitHub Repository](https://github.com/xiaolin26/Corivo)
- [npm Package](https://www.npmjs.com/package/corivo)
- [Documentation](https://github.com/xiaolin26/Corivo#readme)
