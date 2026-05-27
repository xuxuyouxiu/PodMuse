# 播客笔记助手 🎧

[**English**](./README_EN.md) | **中文**

将小宇宙播客链接自动转换为结构化的 Obsidian 笔记。支持音频下载、Whisper 语音转文字、DeepSeek AI 提炼，以及飞书消息轮询自动处理。

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 功能特性

- **一键处理** — 粘贴小宇宙播客链接，自动完成提取、下载、转写、校对和笔记整理
- **AI 笔记生成** — DeepSeek 大模型自动生成结构化笔记（核心观点、关键对话、术语词典、金句摘录等）
- **自动实体卡片** — 自动识别播客中的人物、项目、概念，用预设模板生成独立卡片笔记
- **双向链接** — 播客笔记与实体卡片之间自动建立 Obsidian 双向链接
- **飞书消息集成** — 在飞书群聊中发送播客链接即可自动触发处理流程
- **Whisper 模型管理** — 支持 tiny 到 large-v3-turbo 多种模型切换，自动检测硬件兼容性
- **Obsidian 模板化** — 使用自定义模板生成笔记，保持知识体系一致性

## 快速开始

### 前置依赖

1. **Faster-Whisper-XXL** — 本地语音转文字引擎
   - 下载：[GitHub Releases](https://github.com/Purfview/whisper-standalone-win/releases)
   - 将 `faster-whisper-xxl.exe` 放置到本地目录

2. **DeepSeek API Key** — AI 笔记生成
   - 注册：[DeepSeek 开放平台](https://platform.deepseek.com/)
   - 创建 API Key

3. **Obsidian**（可选）— 笔记知识库
   - https://obsidian.md/

### 安装

```bash
# 克隆仓库
git clone https://github.com/xuxuyouxiu/Podcast_notes.git
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
  "api_key": "你的 DeepSeek API Key",
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
         → ④ DeepSeek 专有名词修正 → ⑤ DeepSeek 笔记生成
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
| Electron | 桌面应用框架 |
| React | 前端界面 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Whisper / faster-whisper-xxl | 语音转文字 |
| DeepSeek API | AI 笔记生成 |
| electron-builder | 打包分发 |
| ESLint + Prettier | 代码规范 |

## 贡献

欢迎提交 Issue 和 Pull Request。详见 [`CONTRIBUTING.md`](CONTRIBUTING.md)

## 开源协议

MIT
