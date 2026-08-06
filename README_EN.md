# PodMuse 🎧

[**中文**](./README.md) | **English**

**PodMuse** — Turn podcasts into a knowledge base. Paste any podcast/video link, and AI automatically transcribes, summarizes, and generates structured notes in Obsidian.

Supports Xiaoyuzhou FM, Bilibili, YouTube, Ximalaya, Apple Podcasts, Douyin and more. One-click extraction, download, Whisper transcription, AI note generation, and auto-writing into your Obsidian vault.

[![Version](https://img.shields.io/github/package-json/v/xuxuyouxiu/PodMuse?label=version)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Features

- **Multi-Platform** — Xiaoyuzhou FM, Bilibili, YouTube, Ximalaya, Apple Podcasts, Douyin in one input box
- **One-Click Processing** — Paste a link and auto-complete extraction, download, transcription, correction, and note organization
- **Multi-AI Providers** — Supports DeepSeek, OpenAI, Moonshot (Kimi), Zhipu AI (GLM), Qwen, Yi, MiniMax, and 7+ other providers
- **AI Note Generation** — LLM generates structured notes (key insights, dialogue highlights, glossary, quotes, etc.)
- **Auto Entity Cards** — Automatically identifies people, projects, and concepts, generating standalone card notes from templates
- **Bidirectional Links** — Auto-creates Obsidian [[wikilinks]] between podcast notes and entity cards
- **Lark Integration** — Send a podcast link in a Lark group chat to trigger automated processing
- **Whisper Model Management** — Switch between tiny to large-v3-turbo models with automatic hardware compatibility detection
- **Obsidian Templates** — Custom templates for consistent knowledge base structure
- **Modern UI** — Glassmorphism design, dark theme, smooth animations

## Quick Start

### Prerequisites

1. **Faster-Whisper-XXL** — Local speech-to-text engine
   - Download: [GitHub Releases](https://github.com/Purfview/whisper-standalone-win/releases)
   - Place `faster-whisper-xxl.exe` in a local directory

2. **AI API Key** — AI note generation (choose one)
   - [DeepSeek](https://platform.deepseek.com/)
   - [OpenAI](https://platform.openai.com/)
   - [Moonshot (Kimi)](https://platform.moonshot.cn/)
   - [Zhipu AI (GLM)](https://open.bigmodel.cn/)
   - [Qwen](https://dashscope.aliyun.com/)
   - [Yi](https://platform.lingyiwanwu.com/)
   - [MiniMax](https://platform.minimaxi.com/)
   - Or other OpenAI-compatible APIs

3. **Obsidian** (optional) — Knowledge base
   - https://obsidian.md/

### Installation

```bash
# Clone the repository
git clone https://github.com/xuxuyouxiu/PodMuse.git
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
  "ai_provider": "deepseek",
  "api_key": "Your AI API Key",
  "api_base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
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
             → ④ AI Named-Entity Correction → ⑤ AI Note Generation
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
| Electron 33 | Desktop app framework |
| React 18 | Frontend UI |
| TypeScript | Type safety |
| Vite 6 | Build tooling |
| Tailwind CSS 3 | Styling system |
| shadcn/ui | UI component library |
| Lucide React | Icon library |
| motion/react | Animation engine |
| Whisper / faster-whisper-xxl | Speech-to-text |
| Multi-AI Providers | AI note generation |
| electron-builder | Packaging & distribution |
| ESLint + Prettier | Code quality |

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## License

The source code of this project is licensed under the [MIT License](LICENSE).

### Third-Party Component Licensing

The built artifacts (installer packages) include the following third-party components with licenses different from the project source:

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**: distributed as a precompiled binary bundled with the installer, licensed under [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). The built artifacts as a whole comply with the terms of GPL-3.0.
- **[Faster-Whisper-XXL](https://github.com/Purfview/whisper-standalone-win)**: users must download and configure it separately; not distributed with this software.
- **[Electron](https://www.electronjs.org/)**: [MIT License](https://github.com/electron/electron/blob/main/LICENSE).

Please ensure you understand and agree to the license terms of all the above components before using this software.
