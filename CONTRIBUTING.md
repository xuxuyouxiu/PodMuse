# 贡献指南

感谢你对播客笔记助手的关注！本文件包含参与本项目开发的指引。

## 行为准则

- 保持友好和尊重
- 接受建设性批评
- 专注于对项目最有利的事情

## 如何贡献

### 报告 Bug

1. 在 [Issues](https://github.com/xuxuyouxiu/podcast-notes/issues) 中搜索，确认是否已有相同问题
2. 如果没有，创建一个新 Issue，包含：
   - 清晰的问题描述
   - 复现步骤
   - 期望行为 vs 实际行为
   - 操作系统和 Node.js 版本
   - 相关的错误日志或截图

### 提交功能请求

1. 在 [Issues](https://github.com/xuxuyouxiu/podcast-notes/issues) 中搜索类似建议
2. 创建新 Issue，描述功能需求和使用场景

### 提交代码

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 确保代码通过 lint 检查
   ```bash
   npm run lint
   npm run format
   ```
4. 提交变更 (`git commit -m 'feat: 添加某某功能'`)
5. 推送到分支 (`git push origin feature/amazing-feature`)
6. 创建 Pull Request

### 开发环境设置

```bash
git clone https://github.com/xuxuyouxiu/podcast-notes.git
cd podcast-notes
npm install
cp podcast_config.example.json podcast_config.json
# 编辑 podcast_config.json 填入配置
npm run dev
```

### 提交信息规范

使用 [约定式提交](https://www.conventionalcommits.org/zh-hans/) 格式：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档变更
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具链变更

### 代码风格

- TypeScript 严格模式
- React 函数组件 + Hooks
- ESLint + Prettier 统一代码风格
- 提交前运行 `npm run lint` 和 `npm run format`

### 项目结构

详见 [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)
