# 播客笔记助手 (Podcast Notes Assistant)

> 小宇宙播客链接 → Whisper 转录 → DeepSeek AI 提炼 → Obsidian 结构化笔记，一条龙自动化。

---

## ✨ 功能

- **一键处理** — 粘贴小宇宙播客链接，自动完成下载、转录、校对、提炼全流程
- **AI 结构化笔记** — 由 DeepSeek 生成含核心观点、金句、术语词典、关联延伸的 Markdown 笔记
- **实体卡片** — 自动识别播客中的人物、项目、概念，生成独立的 Obsidian 笔记
- **飞书集成** — 支持飞书群聊消息自动触发处理，团队协作更高效
- **智能分类** — 根据内容标签自动将笔记归档到对应的 Obsidian 分类目录
- **本地转录** — 使用本地 Faster-Whisper-XXL 进行语音转文字，数据不出本地
- **双向链接** — 笔记中的人物、概念、书籍等自动以 `[[wiki link]]` 格式关联
- **中英混合** — 支持中文、英文及中英混合播客内容

## 🖥️ 界面

- 无框桌面窗口，支持暗色/亮色双主题
- 5 步处理流程可视化（解析 → 下载 → 转录 → 校对 → 生成笔记）
- 历史任务管理，支持恢复、重做、删除

## 🔄 工作流程

```
小宇宙链接
    │
    ▼
[1] 解析页面 ── 提取音频 URL 和播客元信息
    │
    ▼
[2] 下载音频 ── 流式下载到本地缓存
    │
    ▼
[3] Whisper 转录 ── 本地 Faster-Whisper-XXL 语音转文字
    │
    ▼
[4] AI 校对 ── DeepSeek 修正同音词和专有名词错误
    │
    ▼
[5] 生成笔记 ── DeepSeek 生成结构化 Markdown + 实体卡片
    │
    ▼
Obsidian 目录（自动分类归档）
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Vite 6 |
| 动画 | Framer Motion 11 |
| 语音转文字 | Faster-Whisper-XXL (`large-v3-turbo`) |
| AI 模型 | DeepSeek Chat API |
| 笔记系统 | Obsidian（双向链接 + Frontmatter） |
| 即时通讯 | 飞书 Open API |
| 打包 | electron-builder (NSIS) |

## 📦 快速开始

### 前置依赖

- **Node.js** >= 18
- **Faster-Whisper-XXL** — 本地安装，用于语音转文字
- **DeepSeek API Key** — 用于 AI 校对和笔记生成
- **Obsidian** — 笔记归档目标
- **飞书应用**（可选）— 用于群聊消息触发

### 安装

```bash
git clone https://github.com/xuxuyouxiu/podcast-notes.git
cd podcast-notes
npm install
```

### 配置

在项目根目录创建 `podcast_config.json`（可参考 `podcast_config.example.json`）：

```json
{
  "api_key": "你的 DeepSeek API Key",
  "feishu_app_id": "你的飞书应用 App ID（可选）",
  "feishu_app_secret": "你的飞书应用 App Secret（可选）",
  "language": "auto",
  "feishu_chat_id": "你的飞书群聊 Chat ID（可选）",
  "obsidian_dir": "你的 Obsidian 笔记目录路径",
  "audio_dir": "",
  "category_config_path": ""
}
```

### 开发模式

```bash
npm start
```

### 构建安装包

```bash
npm run build
```

构建产物在 `dist-exe/` 目录下。

## 📁 项目结构

```
podcast-notes/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── config.ts        # 配置读写
│   │   ├── deepseek.ts      # DeepSeek API 调用
│   │   ├── entity-cards.ts  # 实体卡片解析
│   │   ├── feishu.ts        # 飞书监听总控
│   │   ├── feishu-client.ts # 飞书 API 客户端
│   │   ├── message-parser.ts
│   │   ├── message-poller.ts
│   │   ├── obsidian-categories.ts
│   │   ├── podcast.ts       # 核心处理管道
│   │   ├── whisper.ts       # Whisper 转录调用
│   │   └── ...
│   ├── renderer/            # React 渲染进程
│   │   ├── components/      # UI 组件
│   │   ├── styles/          # 样式文件
│   │   └── App.tsx          # 主应用组件
│   └── shared/              # 共享类型定义
├── obsidian_templates/      # Obsidian 笔记模板
├── scripts/                 # 构建/部署脚本
├── tests/                   # 测试文件
├── package.json
└── electron-builder.yml     # 打包配置
```

## 📝 笔记模板

项目内置了 4 种 Obsidian 笔记模板（位于 `obsidian_templates/`）：

- `Podcast_Template.md` — 播客笔记模板
- `People_Template.md` — 人物卡片模板
- `Project_Template.md` — 项目卡片模板
- `Concept_Template.md` — 概念卡片模板

## ⚠️ 注意事项

- **配置文件** `podcast_config.json` 包含 API 密钥等敏感信息，请勿提交到公开仓库（已在 `.gitignore` 中忽略）
- Whisper 可执行文件路径需要在 `src/main/whisper.ts` 中根据你的实际安装位置修改
- 飞书功能为可选项，不配置飞书凭证也能正常使用手动输入处理

## 📄 许可

MIT License

---

# Podcast Notes Assistant

> Xiaoyuzhou podcast links → Whisper transcription → DeepSeek AI refinement → Obsidian structured notes, fully automated.

## ✨ Features

- **One-click Processing** — Paste a Xiaoyuzhou podcast link to download, transcribe, proofread, and distill into notes
- **AI Structured Notes** — DeepSeek generates Markdown notes with key insights, quotes, terminology glossary, and related extensions
- **Entity Cards** — Automatically identifies people, projects, and concepts mentioned in podcasts, generating standalone Obsidian notes
- **Feishu Integration** — Supports automated processing triggered by Feishu group chat messages
- **Smart Categorization** — Auto-archives notes into corresponding Obsidian folders based on content tags
- **Local Transcription** — Uses local Faster-Whisper-XXL for speech-to-text, keeping data on-device
- **Bidirectional Links** — People, concepts, and books are automatically linked in `[[wiki link]]` format
- **Bilingual Support** — Handles Chinese, English, and mixed-language podcast content

## 🔄 Workflow

```
Xiaoyuzhou Link
    │
    ▼
[1] Parse Page ── Extract audio URL and podcast metadata
    │
    ▼
[2] Download Audio ── Stream to local cache
    │
    ▼
[3] Whisper Transcribe ── Local Faster-Whisper-XXL speech-to-text
    │
    ▼
[4] AI Proofread ── DeepSeek corrects homophone and proper noun errors
    │
    ▼
[5] Generate Notes ── DeepSeek produces structured Markdown + entity cards
    │
    ▼
Obsidian Directory (auto-categorized)
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron 33 |
| Frontend | React 18 + TypeScript + Vite 6 |
| Animation | Framer Motion 11 |
| Speech-to-Text | Faster-Whisper-XXL (`large-v3-turbo`) |
| AI Model | DeepSeek Chat API |
| Note System | Obsidian (bidirectional links + Frontmatter) |
| Messaging | Feishu Open API |
| Packaging | electron-builder (NSIS) |

## 📦 Quick Start

### Prerequisites

- **Node.js** >= 18
- **Faster-Whisper-XXL** — locally installed for speech-to-text
- **DeepSeek API Key** — for AI proofreading and note generation
- **Obsidian** — target for note archiving
- **Feishu App** (optional) — for group chat message triggering

### Installation

```bash
git clone https://github.com/xuxuyouxiu/podcast-notes.git
cd podcast-notes
npm install
```

### Configuration

Create `podcast_config.json` in the project root (see `podcast_config.example.json` as reference):

```json
{
  "api_key": "your DeepSeek API Key",
  "feishu_app_id": "your Feishu App ID (optional)",
  "feishu_app_secret": "your Feishu App Secret (optional)",
  "language": "auto",
  "feishu_chat_id": "your Feishu Chat ID (optional)",
  "obsidian_dir": "path to your Obsidian notes directory",
  "audio_dir": "",
  "category_config_path": ""
}
```

### Development

```bash
npm start
```

### Build Installer

```bash
npm run build
```

Build output is in the `dist-exe/` directory.

## 📁 Project Structure

```
podcast-notes/
├── src/
│   ├── main/                # Electron main process
│   │   ├── config.ts        # Config read/write
│   │   ├── deepseek.ts      # DeepSeek API calls
│   │   ├── entity-cards.ts  # Entity card parser
│   │   ├── feishu.ts        # Feishu monitor controller
│   │   ├── feishu-client.ts # Feishu API client
│   │   ├── message-parser.ts
│   │   ├── message-poller.ts
│   │   ├── obsidian-categories.ts
│   │   ├── podcast.ts       # Core processing pipeline
│   │   ├── whisper.ts       # Whisper transcription
│   │   └── ...
│   ├── renderer/            # React renderer process
│   │   ├── components/      # UI components
│   │   ├── styles/          # Stylesheets
│   │   └── App.tsx          # Main app component
│   └── shared/              # Shared type definitions
├── obsidian_templates/      # Obsidian note templates
├── scripts/                 # Build/deploy scripts
├── tests/                   # Test files
├── package.json
└── electron-builder.yml     # Packaging config
```

## 📄 License

MIT License
