# 播客笔记助手 UI 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有业务能力的前提下，将播客笔记助手升级为默认深色、支持浅色切换的轻后台工作台界面。

**Architecture:** 以渲染层重构为主，先建立统一主题变量和主题持久化，再重排 `App.tsx` 布局骨架，最后逐个升级顶部栏、主流程卡片、右侧任务面板和设置面板。所有业务逻辑、IPC 通道和状态语义保持不变，只调整展示层和局部状态组织。

**Tech Stack:** React 18、TypeScript、Electron Renderer、CSS Variables、Node Test

---

## 文件结构

### 计划新增

- `g:\Podcast_Notes\src\renderer\components\WorkspaceSidebar.tsx`
  - 装饰性左侧栏，承载品牌、轻入口和视觉分区
- `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`
  - 对主题切换、主题持久化、关键布局类进行静态断言

### 计划修改

- `g:\Podcast_Notes\src\renderer\App.tsx`
  - 重排整体布局，增加主题状态、左中右三栏结构
- `g:\Podcast_Notes\src\renderer\styles\globals.css`
  - 建立深浅双主题变量、通用卡片样式、工作台布局样式
- `g:\Podcast_Notes\src\renderer\components\Header.tsx`
  - 升级为顶部工具栏，加入搜索外观位、主题切换、状态胶囊
- `g:\Podcast_Notes\src\renderer\components\StatusBar.tsx`
  - 压缩并适配顶部状态区
- `g:\Podcast_Notes\src\renderer\components\UrlInput.tsx`
  - 升级为主操作卡片视觉
- `g:\Podcast_Notes\src\renderer\components\StepPanel.tsx`
  - 升级为流程卡片视觉，强化阶段信息展示
- `g:\Podcast_Notes\src\renderer\components\ControlBar.tsx`
  - 并入工作台操作区风格
- `g:\Podcast_Notes\src\renderer\components\RecentTasksSidebar.tsx`
  - 升级为右侧任务状态面板
- `g:\Podcast_Notes\src\renderer\components\SettingsDialog.tsx`
  - 统一设置面板风格

---

### Task 1: 建立主题系统与持久化

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 写失败测试，约束主题切换和持久化入口**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('App stores explicit theme choice in localStorage', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /localStorage\.getItem\(['"]podcast-theme['"]\)/)
  assert.match(source, /localStorage\.setItem\(['"]podcast-theme['"],\s*nextTheme\)/)
})

test('globals defines dark and light theme variables', () => {
  const source = fs.readFileSync(new URL('../src/renderer/styles/globals.css', import.meta.url), 'utf8')
  assert.match(source, /\[data-theme='dark'\]/)
  assert.match(source, /\[data-theme='light'\]/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: FAIL，提示缺少 `podcast-theme` 本地存储逻辑和双主题选择器。

- [ ] **Step 3: 以最小实现加入主题状态**

```tsx
type ThemeMode = 'dark' | 'light'

const [theme, setTheme] = useState<ThemeMode>(() => {
  const saved = localStorage.getItem('podcast-theme')
  return saved === 'light' ? 'light' : 'dark'
})

const toggleTheme = useCallback(() => {
  setTheme((current) => {
    const nextTheme = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem('podcast-theme', nextTheme)
    return nextTheme
  })
}, [])
```

```css
body[data-theme='dark'] {
  --bg-app: #090b12;
  --bg-panel: rgba(18, 20, 30, 0.82);
  --text-primary: #f5f7ff;
}

body[data-theme='light'] {
  --bg-app: #f4f5f9;
  --bg-panel: rgba(255, 255, 255, 0.92);
  --text-primary: #161925;
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add tests/ui-theme-source.test.mjs src/renderer/App.tsx src/renderer/styles/globals.css
git commit -m "feat: add renderer theme system"
```

---

### Task 2: 重构工作台布局骨架

**Files:**
- Create: `g:\Podcast_Notes\src\renderer\components\WorkspaceSidebar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 写失败测试，约束左中右布局骨架**

```js
test('App renders workspace shell with sidebar, main content and aside panel', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /<WorkspaceSidebar/)
  assert.match(source, /workspace-main/)
  assert.match(source, /workspace-aside/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: FAIL，提示 `WorkspaceSidebar` 和工作台区域标识不存在。

- [ ] **Step 3: 最小实现布局骨架**

```tsx
<div className="workspace-shell">
  <WorkspaceSidebar />
  <div className="workspace-main">
    <Header ... />
    <div className="workspace-content">{/* 主内容 */}</div>
  </div>
  <aside className="workspace-aside">{/* 最近任务与状态 */}</aside>
</div>
```

```tsx
export default function WorkspaceSidebar() {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-brand">播客笔记助手</div>
      <nav className="workspace-nav">
        <button className="workspace-nav-item active">首页</button>
        <button className="workspace-nav-item">最近任务</button>
        <button className="workspace-nav-item">设置</button>
        <button className="workspace-nav-item">关于</button>
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/App.tsx src/renderer/styles/globals.css src/renderer/components/WorkspaceSidebar.tsx tests/ui-theme-source.test.mjs
git commit -m "feat: add workspace shell layout"
```

---

### Task 3: 升级顶部工具栏与状态区

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\components\Header.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\StatusBar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 写失败测试，约束顶部栏新元素**

```js
test('Header exposes theme toggle and search placeholder shell', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/Header.tsx', import.meta.url), 'utf8')
  assert.match(source, /onToggleTheme/)
  assert.match(source, /搜索播客|搜索笔记|搜索关键词/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: FAIL，提示顶部栏尚未包含主题切换和搜索外观位。

- [ ] **Step 3: 最小实现新的 Header API 和 UI**

```tsx
interface HeaderProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: FeishuStatus
}

<div className="topbar-search" aria-hidden="true">
  <span>搜索笔记、播客、关键词...</span>
  <kbd>Ctrl + K</kbd>
</div>

<button onClick={onToggleTheme} className="theme-switch">
  {theme === 'dark' ? '浅色' : '深色'}
</button>
```

```tsx
<div className="status-pill success">
  <span className="status-dot" />
  飞书已连接
</div>
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/Header.tsx src/renderer/components/StatusBar.tsx src/renderer/App.tsx tests/ui-theme-source.test.mjs
git commit -m "feat: redesign top toolbar and status area"
```

---

### Task 4: 改造主工作区卡片

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\components\UrlInput.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\StepPanel.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\ControlBar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 写失败测试，约束主卡片类名和工作台段落**

```js
test('main workflow uses hero card and process card sections', () => {
  const app = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /workspace-hero/)
  assert.match(app, /workspace-process-card/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: FAIL

- [ ] **Step 3: 最小实现主区三段卡片**

```tsx
<section className="workspace-hero">
  <h1>欢迎回来，管理员</h1>
  <p>你的 AI 播客助手，帮你记录、整理和沉淀每一个想法。</p>
</section>

<section className="workspace-input-card">
  <UrlInput ... />
</section>

<section className="workspace-process-card">
  <StepPanel ... />
  <ControlBar ... />
</section>
```

```css
.workspace-process-card,
.workspace-input-card,
.workspace-hero {
  background: var(--bg-panel);
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  box-shadow: var(--panel-shadow);
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/App.tsx src/renderer/components/UrlInput.tsx src/renderer/components/StepPanel.tsx src/renderer/components/ControlBar.tsx src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "feat: redesign workflow cards"
```

---

### Task 5: 升级右侧任务面板与设置弹窗

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\components\RecentTasksSidebar.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\components\SettingsDialog.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 写失败测试，约束右侧面板和设置样式入口**

```js
test('recent tasks sidebar uses dashboard card styling hooks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/RecentTasksSidebar.tsx', import.meta.url), 'utf8')
  assert.match(source, /task-panel|task-card|task-status-badge/)
})

test('settings dialog includes grouped sections styling hooks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/SettingsDialog.tsx', import.meta.url), 'utf8')
  assert.match(source, /settings-section|settings-grid/)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: FAIL

- [ ] **Step 3: 最小实现右侧面板和设置分组**

```tsx
<section className="task-panel">
  <div className="task-panel-header">处理任务</div>
  {tasks.map((task) => (
    <article key={task.id} className="task-card">
      <div className={`task-status-badge ${task.status}`}>{task.status}</div>
    </article>
  ))}
</section>
```

```tsx
<div className="settings-section">
  <h3>基础设置</h3>
  <div className="settings-grid">{/* 字段 */}</div>
</div>
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/RecentTasksSidebar.tsx src/renderer/components/SettingsDialog.tsx src/renderer/styles/globals.css tests/ui-theme-source.test.mjs
git commit -m "feat: refresh task panel and settings dialog"
```

---

### Task 6: 集成验证与打包验收

**Files:**
- Modify: `g:\Podcast_Notes\src\renderer\App.tsx`
- Modify: `g:\Podcast_Notes\src\renderer\styles\globals.css`
- Test: `g:\Podcast_Notes\tests\ui-theme-source.test.mjs`

- [ ] **Step 1: 运行静态测试**

Run: `node --test tests/ui-theme-source.test.mjs`

Expected: PASS

- [ ] **Step 2: 运行生产构建**

Run: `npm run vite-build`

Expected:

```text
✓ built in ...
dist-electron/main/index.js ...
dist-electron/preload/preload.js ...
```

- [ ] **Step 3: 打包新的调试目录**

Run: `node "node_modules/electron-builder/out/cli/cli.js" --win --config.directories.output=dist-exe-ui-refresh`

Expected:

```text
• packaging platform=win32 arch=x64
• building target=nsis
```

- [ ] **Step 4: 手动验收**

检查项：

```text
1. 默认进入深色主题
2. 点击主题切换后，浅色主题立即生效
3. 关闭重开后保留上次主题
4. 粘贴链接后仍可正常开始处理
5. 右侧最近任务仍可继续/重试/删除
6. 小窗口下步骤区和输入区不被遮挡
```

- [ ] **Step 5: 提交**

```bash
git add src/renderer tests/ui-theme-source.test.mjs
git commit -m "feat: ship workspace style ui refresh"
```

---

## 自检

- 规格覆盖：
  - 双主题：Task 1
  - 工作台布局：Task 2
  - 顶部栏与状态区：Task 3
  - 主流程卡片化：Task 4
  - 右侧任务面板与设置：Task 5
  - 构建与验收：Task 6

- 占位检查：
  - 无 `TODO`、`TBD`、`implement later`
  - 所有任务都包含明确文件、测试、命令和预期输出

- 类型一致性：
  - 主题值统一使用 `'dark' | 'light'`
  - 顶部栏统一使用 `onToggleTheme`
  - 工作台布局统一使用 `workspace-*` 命名
