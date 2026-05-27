# 更新日志

所有值得注意的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，\
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [3.0.0] - 2026-05-27

### 新增
- 项目标准化整理：添加 ESLint + Prettier 代码规范配置
- 统一项目目录结构，梳理依赖分类（dependencies / devDependencies）
- 补全标准文档体系（CHANGELOG.md、CONTRIBUTING.md、PROJECT_STRUCTURE.md）
- 添加 `npm run lint` / `npm run format` 等代码质量脚本
- 补充 `package.json` 元信息字段（author、license、repository、keywords 等）

### 变更
- 移动根目录零散资源文件（`播客笔记_256.png`、`yangtu.png`）到 `build/` 目录
- 清理根目录冗余文件（`index.js`、`dist-debug-L.txt`）
- 删除三份重复的构建输出目录（`dist-personal/`、`dist-personal-v2/`、`dist-release/`）
- 修复 `.gitignore`：添加 dist-* 目录忽略规则，移除全局图片屏蔽规则

### 修复
- 修复 `framer-motion`、`react`、`react-dom` 被错误归类为 devDependencies 的问题

## [2.0.0] - 2026-05-26

### 新增
- 实体卡片自动生成功能（人物、项目、概念）
- 大分类自动归档引擎
- Obsidian 双向链接支持
- 飞书消息轮询集成
- Whisper 模型管理面板
- 任务恢复机制

## [1.0.0] - 2026-05-24

### 新增
- 初始版本发布
- 小宇宙播客链接解析与音频下载
- Whisper 语音转文字
- DeepSeek AI 笔记生成
- Electron 桌面应用框架
- React 用户界面
