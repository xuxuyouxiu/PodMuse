# Podcast Notes Assistant 🎧

[**中文**](./README.md) | **English**

Automatically convert Xiaoyuzhou FM podcast links into structured Obsidian notes. Supports audio download, Whisper speech-to-text, DeepSeek AI summarization, and Lark message polling for automated processing.

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Features

- **One-Click Processing** — Paste a Xiaoyuzhou FM link and auto-complete extraction, download, transcription, correction, and note organization
- **AI Note Generation** — DeepSeek LLM generates structured notes (key insights, dialogue highlights, glossary, quotes, etc.)
- **Auto Entity Cards** — Automatically identifies people, projects, and concepts, generating standalone card notes from templates
- **Bidirectional Links** — Auto-creates Obsidian [[wikilinks]] between podcast notes and entity cards
- **Lark Integration** — Send a podcast link in a Lark group chat to trigger automated processing
- **Whisper Model Management** — Switch between tiny to large-v3-turbo models with automatic hardware compatibility detection
- **Obsidian Templates** — Custom templates for consistent knowledge base structure

## Quick Start

### Prerequisites

1. **Faster-Whisper-XXL** — Local speech-to-text engine
   - Download: [GitHub Releases](https://github.com/Purfview/whisper-standalone-win/releases)
   - Place `faster-whisper-xxl.exe` in a local directory

2. **DeepSeek API Key** — AI note generation
   - Register: [DeepSeek Platform](https://platform.deepseek.com/)
   - Create an API Key

3. **Obsidian** (optional) — Knowledge base
   - https://obsidian.md/

### Installation

```bash
# Clone the repository
git clone https://github.com/xuxuyouxiu/Podcast_notes.git
cd podcast-notes

# Install dependencies
npm install

# Create config file (copy the example and fill in your settings)
cp podcast_config.example.json podcast_config.json
# Edit podcast_config.json with your API Key, Lark config, etc.

# Launch
npm start
```

### Configuration

```json
{
  "api_key": "Your DeepSeek API Key",
  "feishu_app_id": "Your Lark App ID",
  "feishu_app_secret": "Your Lark App Secret",
  "language": "auto",
  "feishu_chat_id": "Your Lark Chat ID",
  "obsidian_dir": "Your Obsidian vault path",
  "audio_dir": "",
  "whisper_exe_path": "Your Faster-Whisper-XXL executable path",
  "whisper_model": "large-v3-turbo"
}
```

Config is persisted to `%APPDATA%\播客笔记助手\podcast_config.json`, unaffected by app updates.

## Processing Pipeline

```
Podcast Link → ① Parse Page → ② Download Audio → ③ Whisper Transcription
             → ④ DeepSeek Named-Entity Correction → ⑤ DeepSeek Note Generation
             → Write to Obsidian + Generate Entity Cards (People/Projects/Concepts)
```

## Project Structure

For a detailed breakdown, see [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)

```
podcast-notes/
├── src/
│   ├── main/               # Electron main process
│   ├── renderer/           # React renderer process
│   └── shared/             # Shared type definitions
├── tests/                  # Test files
├── obsidian_templates/     # Obsidian note templates
├── docs/                   # Project documentation
├── scripts/                # Build & deploy scripts
├── build/                  # Packaging assets
└── public/                 # Static assets
```

## Development

```bash
# Start dev server
npm run dev

# Lint check
npm run lint

# Auto-format
npm run format:fix

# Build test package
npm run refresh:test
```

## Tech Stack

| Technology | Purpose |
|---|---|
| Electron | Desktop app framework |
| React | Frontend UI |
| TypeScript | Type safety |
| Vite | Build tooling |
| Whisper / faster-whisper-xxl | Speech-to-text |
| DeepSeek API | AI note generation |
| electron-builder | Packaging & distribution |
| ESLint + Prettier | Code quality |

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## License

MIT
