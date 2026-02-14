# Siesta Desktop

A macOS desktop app for immersive language learning. Siesta delivers periodic "Word of the Hour" notifications, flashcard widgets, and a quick lookup tool — all living in your menu bar.

Built with [Tauri v2](https://tauri.app/), React 19, and TypeScript.

## Features

- **Word of the Hour** — periodic notifications with a new word in your target language
- **Flashcard Widget** — always-on-top mini flashcard for passive learning
- **Quick Lookup** — translate any word or phrase with `Cmd+Shift+O`
- **Vocabulary Tracking** — words progress through exposed → familiar → acquired stages
- **Multi-language** — Italian, Spanish, French, German, Hindi, Tamil, Mandarin
- **Dark Mode** — system-friendly dark theme toggle
- **Chrome Extension Sync** — shares vocabulary with the [Siesta Chrome extension](https://github.com/kavsraman/siesta-extension) via a local sync server on `localhost:7749`

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

The built `.app` bundle will be in `src-tauri/target/release/bundle/macos/`.

## Architecture

```
src/                    # React frontend (TypeScript)
  App.tsx               # Main application component
  utils/storage.ts      # Vocabulary, settings, and shared vocab merge logic
src-tauri/              # Rust backend
  src/lib.rs            # Tauri commands, tray menu, sync server lifecycle
  src/word_timer.rs     # Word-of-the-hour timer with spaced repetition
  src/clipboard.rs      # Clipboard monitoring
  sync-server.js        # Node.js sync server (embedded, spawned on launch)
  words/*.json          # 250-word lists per language
```

## Sync Server

On launch, the desktop app spawns a lightweight Node.js HTTP server on `localhost:7749` that bridges the Chrome extension to the filesystem:

| Endpoint | Description |
|----------|-------------|
| `GET /api/vocabulary` | Read `~/.siesta/vocabulary.json` |
| `POST /api/vocabulary` | Merge word data into vocabulary |
| `GET /api/config` | Read `~/.siesta/config.json` |
| `POST /api/config` | Write config (API key) |

## License

MIT
