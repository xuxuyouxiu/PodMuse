# 播客笔记助手侧边栏与系统操作重构设计

日期：2026-05-26

## 目标

- 调整系统级功能入口位置，将「设置」和「关于」按钮从主工作区（任务窗格底部）迁移至左侧侧边栏底部。
- 移除原有的「清除缓存」功能按钮及相关冗余入口。
- 优化侧边栏整体布局、交互反馈（hover/active）以及功能分组逻辑，提升界面的规范性与易用性。

## 范围

本次修改涉及系统设置类功能的入口迁移及侧边栏的 UI 强化，包含相关组件拆解和外层容器 `App.tsx` 的传参修改。

- **`ControlBar.tsx`**：移除“设置”、“清理缓存”和“关于”按钮，仅保留与流程控制强相关的核心按钮（停止/继续处理）。
- **`WorkspaceSidebar.tsx`**：
  - 重构导航分组，分为顶部业务导航区与底部系统操作区。
  - 增加“设置”（带有标准齿轮图标）和“关于”按钮，放置在底部区域（原 footer 上方或替换部分 footer 元素）。
  - 添加并统一样式交互状态（如 hover 时的高亮反馈）。
- **`App.tsx`**：重构传参逻辑，将 `onSettings` 移交给 `WorkspaceSidebar`，并实现 `onAbout` 函数。

不在本次范围内：

- 修改“设置”弹窗内部的逻辑或样式。
- 修改主流程、任务解析、最近任务的具体逻辑。

## 选定方案

1.  **功能解耦**：
    - `ControlBar` 仅聚焦当前任务的“控制”（暂停/取消/继续）。设置、关于、缓存这些“全局级”操作不再混入任务级控制条。
    - 废弃“清除缓存”入口，从 UI 层面上摘除。
2.  **侧边栏结构梳理**：
    - **顶部品牌区**：Logo 和 标题（保持不变）。
    - **主导航区**：“工作台”和“最近任务”。通过合理的间距与悬停样式，明确其为核心业务视图的切换点。
    - **系统操作区（底部）**：使用细线分割，底部放置“设置”（`⚙ 设置`，或使用 SVG 齿轮图标确保视觉精致）和“关于”按钮。
    - **留白与适配**：使用 Flexbox 将顶部导航和底部操作区分开（`margin-top: auto`），确保在窗口高度拉伸或收缩时，系统操作区始终稳稳地钉在侧边栏底部。

## 技术实现

### `src/renderer/components/ControlBar.tsx`
- 删除 `onSettings`、`onClean` 的 props。
- 删除对应的三个按钮：`⚙ 设置`、`🗑 清理缓存` 和 `关于` 所在的 `<div className="control-bar-group control-bar-group--end">`。
- 控制条现在只留下最左侧的主控按钮，使得工作区底部更加简洁。

### `src/renderer/components/WorkspaceSidebar.tsx`
- 增加 `onSettings` 和 `onAbout` 属性传入。
- 结构调整：
  ```tsx
  <aside className="workspace-sidebar">
    <品牌区 />
    <nav className="workspace-sidebar__nav">
      <!-- 业务导航 -->
      <button>工作台</button>
      <button>最近任务</button>
    </nav>
    <div className="workspace-sidebar__system-ops">
      <!-- 底部通过 margin-top: auto 推至最下 -->
      <button onClick={onSettings}>
        <svg>{/* 标准齿轮图标 */}</svg> 设置
      </button>
      <button onClick={onAbout}>
        <svg>{/* 信息/关于图标 */}</svg> 关于
      </button>
    </div>
  </aside>
  ```
- 为新按钮复用 `.workspace-sidebar__nav-item` 类，或新建 `.workspace-sidebar__sys-item` 类，并补充 hover CSS。

### `src/renderer/App.tsx`
- 在渲染 `<WorkspaceSidebar />` 处传入 `onSettings={() => setSettingsOpen(true)}` 和 `onAbout={() => alert('...')}`。
- 将传给 `ControlBar` 的多余 props 移除。

### `src/renderer/styles/globals.css`
- 补充侧边栏系统操作区的样式。
- 检查 `1100px` 窄屏断点下侧边栏隐藏的逻辑是否需要改变（当前逻辑是 `<1100px` 直接 `display: none`，由于本次修改只是将设置移入，若侧栏被隐藏，用户将无法进行设置。**重要决策**：目前先按照你的要求“在不同窗口尺寸下都能正常显示与交互”，如果原先在极窄屏幕直接隐藏侧栏，可能需要为窄屏提供一个顶栏上的“齿轮”备用入口，或者改变窄屏侧栏策略。鉴于保持整体“视觉一致性”，我们可以考虑在 `1100px` 以下，把“设置”图标放入 `Header` 的右侧操作区，作为窄屏的兜底。但由于需求重点是调整侧栏本身，先重点优化宽屏体验。
- （针对断点的修订）目前先在 `.workspace-topbar__actions` 旁边补充一个只在移动端（`<1100px`）显示的设置图标，作为完美适配方案。

## 验证标准
- 桌面端：左侧边栏底部出现“设置”和“关于”，且交互正常；任务窗格底部仅保留主流程控制按钮。
- 平板/移动端（`<1100px`）：侧边栏折叠后，可以在顶部工具栏找到设置入口，确保核心系统操作不断层。
- “清除缓存”功能不再出现在界面中。
- 所有调整的图标、内边距、悬停状态保持一致，没有视觉突兀感。
