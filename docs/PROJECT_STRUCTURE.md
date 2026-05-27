# 项目目录结构说明

## 顶层结构

```
podcast-notes/
├── build/                  # 打包资源（图标等）
├── docs/                   # 项目文档
│   └── superpowers/        # AI 辅助开发的设计与计划文档
│       ├── plans/          # 实现计划
│       └── specs/          # 设计规范
├── obsidian_templates/      # Obsidian 笔记模板
├── public/                  # Vite 静态资源
├── scripts/                 # 构建/部署脚本
├── src/                     # 源代码
│   ├── main/               # Electron 主进程
│   ├── renderer/           # React 渲染进程
│   └── shared/             # 共享类型定义
├── tests/                   # 测试文件
├── .eslintignore           # ESLint 忽略规则（由 eslint.config.mjs 管理）
├── .gitignore              # Git 忽略规则
├── .prettierignore         # Prettier 忽略规则
├── .prettierrc             # Prettier 配置
├── CHANGELOG.md            # 变更日志
├── CLAUDE.md               # AI 助手行为指南
├── CONTRIBUTING.md         # 贡献指南
├── README.md               # 项目说明
├── electron-builder.yml    # Electron 打包配置
├── eslint.config.mjs       # ESLint 配置（Flat Config）
├── index.html              # Vite 入口 HTML
├── package.json            # 项目依赖与脚本
├── package-lock.json       # 依赖锁定文件
├── podcast_config.example.json  # 配置模板
├── tsconfig.json           # TypeScript 配置
└── vite.config.ts          # Vite 构建配置
```

## 源代码结构 (`src/`)

```
src/
├── main/                          # Electron 主进程
│   ├── config.ts                  # 配置读取与持久化
│   ├── deepseek.ts                # DeepSeek API 集成
│   ├── entity-cards.ts            # 实体卡片生成引擎
│   ├── feishu-client.ts           # 飞书 API 客户端
│   ├── feishu.ts                  # 飞书消息轮询入口
│   ├── index.ts                   # Electron IPC 主入口
│   ├── message-parser.ts          # 消息解析器
│   ├── message-poller.ts          # 消息轮询调度器
│   ├── obsidian-categories.ts     # Obsidian 大分类映射
│   ├── podcast-dispatcher.ts      # 播客处理调度器
│   ├── podcast.ts                 # 播客处理主流程
│   ├── preload.ts                 # Electron 预加载脚本
│   ├── processed-message-store.ts  # 已处理消息存储
│   ├── recent-task-state.ts       # 最近任务状态管理
│   ├── task-recovery.ts           # 任务恢复机制
│   ├── whisper-model-manager.ts   # Whisper 模型管理
│   ├── whisper-progress.ts        # Whisper 进度报告
│   └── whisper.ts                 # Whisper 语音转文字
├── renderer/                      # React 渲染进程
│   ├── components/                # UI 组件
│   │   ├── ActiveTasksPanel.tsx   # 活动任务面板
│   │   ├── ControlBar.tsx         # 控制栏
│   │   ├── ErrorBoundary.tsx      # 错误边界
│   │   ├── Header.tsx             # 顶栏
│   │   ├── RecentTasksPanel.tsx   # 历史任务面板
│   │   ├── SettingsDialog.tsx     # 设置对话框
│   │   ├── StatusBar.tsx          # 状态栏
│   │   ├── StepPanel.tsx          # 步骤面板
│   │   ├── UrlInput.tsx           # URL 输入区
│   │   └── WorkspaceSidebar.tsx   # 侧边栏
│   ├── styles/
│   │   └── globals.css            # 全局样式
│   ├── App.tsx                    # 根组件
│   ├── env.d.ts                   # 类型声明
│   └── main.tsx                   # 渲染进程入口
└── shared/                        # 主进程与渲染进程共享
    └── types.ts                   # 共享类型定义
```

## 测试文件 (`tests/`)

测试文件以 `.test.mjs` 为扩展名，使用 Node.js 原生测试运行器：

| 文件 | 测试目标 |
|------|---------|
| `ai-category.test.mjs` | AI 分类功能 |
| `app-order.test.mjs` | 应用数据排序 |
| `entity-cards.test.mjs` | 实体卡片生成 |
| `message-poller.test.mjs` | 消息轮询 |
| `obsidian-categories.test.mjs` | 大分类映射 |
| `people-filter.test.mjs` | 人物过滤 |
| `pickCategory-real.test.mjs` | 分类选择 |
| `processed-message-store.test.mjs` | 消息存储 |
| `recent-task-state.test.mjs` | 任务状态管理 |
| `refresh-test-flow.test.mjs` | 构建-部署流程 |
| `task-architecture-split.test.mjs` | 任务架构拆分 |
| `task-architecture-ui-split.test.mjs` | 任务 UI 拆分 |
| `ui-theme-source.test.mjs` | UI 主题 |
| `whisper-model-manager.test.mjs` | 模型管理 |
| `whisper-progress.test.mjs` | 进度报告 |

## Obsidian 模板 (`obsidian_templates/`)

用于生成结构化笔记的模板文件：

| 模板 | 用途 |
|------|------|
| `Concept_Template.md` | 概念术语模板 |
| `People_Template.md` | 人物卡片模板 |
| `Podcast_Template.md` | 播客笔记模板 |
| `Project_Template.md` | 项目模板 |
| `Term_Template.md` | 术语模板 |

## 构建配置

| 文件 | 说明 |
|------|------|
| `vite.config.ts` | Vite 构建配置（主进程 + 渲染进程） |
| `tsconfig.json` | TypeScript 编译配置 |
| `electron-builder.yml` | Electron 打包配置 |
| `podcast_config.example.json` | 用户配置模板 |

## 代码质量工具

| 工具 | 配置文件 | 用途 |
|------|---------|------|
| ESLint | `eslint.config.mjs` | 代码静态分析 |
| Prettier | `.prettierrc` | 代码格式化 |
| TypeScript | `tsconfig.json` | 类型检查 |

### NPM 脚本速查

| 脚本 | 用途 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm start` | 启动 Electron 应用 |
| `npm run build` | 生产构建 |
| `npm run build:test` | 测试包构建 |
| `npm run build:setup` | 安装包构建 |
| `npm run refresh:test` | 构建 + 部署测试包 |
| `npm run lint` | 代码检查 |
| `npm run lint:fix` | 自动修复代码问题 |
| `npm run format` | 格式检查 |
| `npm run format:fix` | 自动格式化 |
