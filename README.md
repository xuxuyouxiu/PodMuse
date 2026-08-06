# PodNotes 播客笔记助手 🎧

[**English**](./README_EN.md) | **中文**

> **PodNotes** — 把播客变成知识库。粘贴任意播客/视频链接，AI 自动转写、提炼、生成结构化笔记并写入 Obsidian。

支持**小宇宙、B站、YouTube、喜马拉雅、Apple Podcasts、抖音**等多平台链接，一键自动完成提取、下载、Whisper 语音转写、AI 笔记生成，并自动写入 Obsidian 知识库。

[![Version](https://img.shields.io/github/package-json/v/xuxuyouxiu/PodNotes?label=version)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 功能特性

- **多平台支持** — 小宇宙、B站、YouTube、喜马拉雅、Apple Podcasts、抖音，一个输入框全搞定
- **一键处理** — 粘贴链接，自动完成提取、下载、转写、校对和笔记整理
- **多 AI 供应商** — 支持 DeepSeek、OpenAI、Moonshot（Kimi）、智谱AI（GLM）、通义千问（Qwen）、零一万物（Yi）、MiniMax 等 7+ 供应商
- **AI 笔记生成** — 大语言模型自动生成结构化笔记（核心观点、关键对话、术语词典、金句摘录等）
- **自动实体卡片** — 自动识别播客中的人物、项目、概念，用预设模板生成独立卡片笔记
- **双向链接** — 播客笔记与实体卡片之间自动建立 Obsidian 双向链接
- **飞书消息集成** — 在飞书群聊中发送播客/视频链接即可自动触发处理流程
- **Whisper 模型管理** — 支持 tiny 到 large-v3-turbo 多种模型切换，自动检测硬件兼容性
- **Obsidian 模板化** — 使用自定义模板生成笔记，保持知识体系一致性
- **现代化 UI** — Glassmorphism 设计风格，深色主题，流畅动画

## 快速开始

### 前置依赖

1. **Faster-Whisper-XXL** — 本地语音转文字引擎
   - 下载：[GitHub Releases](https://github.com/Purfview/whisper-standalone-win/releases)
   - 将 `faster-whisper-xxl.exe` 放置到本地目录

2. **AI API Key** — AI 笔记生成（任选其一）
   - [DeepSeek](https://platform.deepseek.com/)
   - [OpenAI](https://platform.openai.com/)
   - [Moonshot (Kimi)](https://platform.moonshot.cn/)
   - [智谱AI (GLM)](https://open.bigmodel.cn/)
   - [通义千问 (Qwen)](https://dashscope.aliyun.com/)
   - [零一万物 (Yi)](https://platform.lingyiwanwu.com/)
   - [MiniMax](https://platform.minimaxi.com/)
   - 或其他 OpenAI 兼容接口

3. **Obsidian**（可选）— 笔记知识库
   - https://obsidian.md/

4. **抖音支持**（可选）— 需要 Python 3.8+ 和 douyin-downloader
   - 下载：[douyin-downloader](https://github.com/jiji262/douyin-downloader)
   - 在设置中配置环境并获取 Cookie

### 安装

```bash
# 克隆仓库
git clone https://github.com/xuxuyouxiu/PodNotes.git
cd podcast-notes

# 安装依赖
npm install

# 创建配置文件（复制示例后填写真实配置）
cp podcast_config.example.json podcast_config.json
# 编辑 podcast_config.json 填入你的 API Key、飞书配置等

# 启动
npm start
```

### 配置文件说明

```json
{
  "ai_provider": "deepseek",
  "api_key": "你的 AI API Key",
  "api_base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "feishu_app_id": "你的飞书应用 App ID",
  "feishu_app_secret": "你的飞书应用 App Secret",
  "language": "auto",
  "feishu_chat_id": "你的飞书群聊 Chat ID",
  "obsidian_dir": "你的 Obsidian 笔记目录路径",
  "audio_dir": "",
  "whisper_exe_path": "你的 Faster-Whisper-XXL 可执行文件路径",
  "whisper_model": "large-v3-turbo"
}
```

配置持久化存储在 `%APPDATA%\播客笔记助手\podcast_config.json`，不受软件更新影响。

## 处理流程

```
播客链接 → ① 解析页面 → ② 下载音频 → ③ Whisper 转文字
         → ④ AI 专有名词修正 → ⑤ AI 笔记生成
         → 写入 Obsidian（大分类文件夹） + 生成实体卡片（人物/项目/概念）
```

## 项目结构

详细目录结构请查看 [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)

```
podcast-notes/
├── src/
│   ├── main/               # Electron 主进程
│   ├── renderer/           # React 渲染进程
│   └── shared/             # 共享类型定义
├── tests/                  # 测试文件
├── obsidian_templates/     # Obsidian 笔记模板
├── docs/                   # 项目文档
├── scripts/                # 构建部署脚本
├── build/                  # 打包资源
└── public/                 # 静态资源
```

## 开发

```bash
# 启动开发模式
npm run dev

# 代码检查
npm run lint

# 代码格式化
npm run format:fix

# 构建测试包
npm run refresh:test
```

## 技术栈

| 技术 | 用途 |
|---|---|
| Electron 33 | 桌面应用框架 |
| React 18 | 前端界面 |
| TypeScript | 类型安全 |
| Vite 6 | 构建工具 |
| Tailwind CSS 3 | 样式系统 |
| shadcn/ui | UI 组件库 |
| Lucide React | 图标库 |
| motion/react | 动画引擎 |
| Whisper / faster-whisper-xxl | 语音转文字 |
| 多 AI 供应商 | AI 笔记生成 |
| yt-dlp | 多平台音视频提取 |
| electron-builder | 打包分发 |
| ESLint + Prettier | 代码规范 |

## 贡献

欢迎提交 Issue 和 Pull Request。详见 [`CONTRIBUTING.md`](CONTRIBUTING.md)

## 开源协议

本项目源码采用 [MIT License](LICENSE) 授权。

### 第三方组件许可说明

本项目的构建产物（安装包）中包含以下第三方组件，其许可证与本项目源码许可不同：

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**：以预编译二进制形式随安装包分发，采用 [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) 许可。构建产物整体遵守 GPL-3.0 条款。
- **[Faster-Whisper-XXL](https://github.com/Purfview/whisper-standalone-win)**：用户需自行下载并配置，不随本软件分发。
- **[Electron](https://www.electronjs.org/)**：[MIT License](https://github.com/electron/electron/blob/main/LICENSE)。

使用本软件前，请确保你理解并同意上述所有组件的许可条款。
