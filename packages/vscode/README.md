# Corivo VS Code Extension

Your Cyber Partner — Persistent memory for VS Code AI assistants.

## Features

- **Save Memories** - Store important information from your coding sessions
- **Query Memories** - Retrieve previously saved information with full-text search
- **Status Display** - View memory statistics in the status bar

## Installation

### Prerequisites

```bash
npm install -g corivo
corivo init
```

### Install Extension

```bash
# From marketplace (coming soon)
code --install-extension xiaolin26.corivo

# From .vsix file
code --install-extension corivo-0.11.0.vsix
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `Corivo: Save Memory` | Save a new memory |
| `Corivo: Query Memories` | Search existing memories |
| `Corivo: Show Status` | View memory statistics |
| `Corivo: Initialize` | Open installation guide |

### Status Bar

The status bar shows:
- Total memory count
- Active memory percentage
- Quick access to status details

```
📦 [corivo] 42 blocks | 85% active
```

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch for changes
npm run watch

# Package
vsce package
```

## License

MIT
