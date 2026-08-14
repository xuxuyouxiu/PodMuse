# 🎧 PodMuse — 把播客变成知识库

**PodMuse** 是一款桌面应用：粘贴任意播客 / 视频链接，AI 自动完成**转写 → 提炼 → 生成结构化笔记 → 写入 Obsidian**，并把节目中出现的人物、公司、概念沉淀成可互链的**个人知识库**。

---

## ✨ 核心功能

| 功能 | 说明 |
| --- | --- |
| 🔗 一键处理 | 粘贴小宇宙 / B站 / 喜马拉雅 / Apple Podcasts / 抖音 / YouTube 链接，自动识别平台 |
| 🎙 智能转写 | 本地 Whisper 转写（支持平台字幕直取），音频/转写自动缓存，重复处理秒级复用 |
| 📝 AI 结构化笔记 | 一句话总结、要点、核心观点、事件详情、金句摘录、术语词典、实体卡片 |
| 🧠 知识库 | 人物 / 项目 / 概念 / 术语四类实体卡片自动生成与互链，双击悬停预览，全局反向链接 |
| 💬 知识问答 | 基于你的笔记库做 RAG 问答，回答附引用来源 |
| 📡 智能订阅 | 订阅喜欢的播客，新节目自动入队处理，全程对普通用户隐藏 RSS 细节 |
| 🧩 浏览器剪藏 | 复制链接自动弹窗（Chrome 扩展 / 书签小工具），一键入队处理 |
| 📊 批量处理 | 多任务队列、实时步骤面板、完成报告、失败重试 |
| 🕘 处理历史 | 任务资产视图、筛选搜索、分页、一键重新生成（可换 AI 模型） |
| 📤 导出中心 | 单篇 / 合集 PDF、Markdown、分享卡片（1080×1440）、Notion / Logseq |
| 🌐 多模型 | 支持 DeepSeek / 小米 MiMo / OpenAI 兼容接口，任务级模型覆盖 |
| ⚡ 自动更新 | 增量自动更新，新版本即装即用 |

## 🚀 快速开始

1. 从 [Releases](https://github.com/xuxuyouxiu/PodMuse/releases) 下载 `PodMuse-Setup-x.x.x.exe` 安装
2. 打开应用 → 设置 → 配置 **Obsidian 库路径** + **AI 模型 API Key**
3. 粘贴一个播客链接（如小宇宙、B站视频）→ 开始处理
4. 笔记自动写入你的 Obsidian 库，实体卡片互链成知识网络

> 使用本地 Whisper 转写需在设置中下载语音模型（首次使用自动提示）。

## 🛠 技术栈

- **Electron + TypeScript + React**（motion 动效、lucide 图标）
- **Whisper**（本地转写）· **yt-dlp**（视频提取）· **rss-parser**（订阅）
- **electron-updater**（增量自动更新）· **marked**（笔记渲染 / PDF 导出）

## 📁 项目结构

```
PodMuse/
├── src/main/          # Electron 主进程（管线、平台适配器、IPC、订阅、剪藏服务）
├── src/renderer/      # React 渲染层（工作台、历史、问答、设置等视图）
├── src/shared/        # 主/渲染共享类型与工具
├── public/            # 静态资源（分享卡模板、平台图标、收款码）
├── chrome-extension/  # 浏览器剪藏扩展（本地加载，免商店）
└── docs/              # 设计文档
```

## ☕ 支持作者

如果 PodMuse 帮你省下了时间，一杯咖啡就是最好的鼓励 —— 谢谢！

| 微信支付 | 支付宝 |
| :---: | :---: |
| <img src="public/donate/wechat.png" width="200"> | <img src="public/donate/alipay.jpg" width="200"> |

---

## 🇬🇧 English

**PodMuse** — Turn podcasts into your knowledge base. Paste any podcast / video link and let AI transcribe, distill and write structured notes directly into your Obsidian vault, with people / companies / concepts linked into an interconnected knowledge graph.

### ✨ Features

- **One-click processing** — Xiao宇宙, Bilibili, Ximalaya, Apple Podcasts, Douyin, YouTube auto-detection
- **Local Whisper transcription** with audio/transcript caching for instant re-processing
- **AI structured notes** — summary, key points, deep dives, quotes, glossary, entity cards
- **Knowledge base** — auto-linked entity cards (people / projects / concepts / terms), hover previews, backlinks
- **RAG Q&A** over your notes with cited sources
- **Smart subscriptions** — new episodes auto-queued, RSS fully hidden from users
- **Browser clipping** — clipboard watcher, Chrome extension & bookmarklet
- **Batch processing** with live step panel, reports and retry
- **Processing history** — asset view, search & filters, pagination, regenerate with model choice
- **Export hub** — single/collection PDF, Markdown, share cards, Notion / Logseq
- **Multi-model support** — DeepSeek / Xiaomi MiMo / OpenAI-compatible APIs
- **Auto-update** — incremental updates in place

### 🚀 Getting Started

1. Download `PodMuse-Setup-x.x.x.exe` from [Releases](https://github.com/xuxuyouxiu/PodMuse/releases)
2. Settings → configure **Obsidian vault path** + **AI API key**
3. Paste a podcast link → process
4. Notes land in your vault, entities interlink into a knowledge network

### ☕ Support

If PodMuse saved you some time, buying me a coffee is the best way to say thanks! ☕ *(see QR codes above)*

---

**License:** MIT
