# 播客笔记助手窄屏布局微调与防遮挡设计

日期：2026-05-26

## 目标

- 修复在窄屏（<1100px）下，最近任务卡片（`workspace-aside`）遮挡主工作区卡片的问题，让它自然跟随整个页面滚动。
- 撤销窄屏下输入链接和按钮的纵向堆叠设计，恢复为横向紧凑模式，保证整体界面的协调性。

## 范围

本次仅处理 `1100px` 断点下的 CSS 响应式布局。不修改任何 JS/TS 业务逻辑。

- **输入卡**：恢复 `.url-input-actions` 为横向 flex 布局，收缩按钮和输入框在窄屏下的间距和内边距，确保不被截断。
- **最近任务栏**：修复外层容器的布局上下文，确保主内容和最近任务在同一个可滚动容器内上下自然排列，杜绝遮挡。

## 问题定义

1.  **遮挡问题**：当前在窄屏下，`.workspace-body` 被设为 `flex-direction: column`，但其子元素的高度、滚动行为（`overflow`）没有正确协同。`.workspace-main-column` 可能没有正确地撑开自身，导致后面的 `.workspace-aside` 覆盖在它上面，或者两者没有在一个共同的滚动视口内。
2.  **输入卡问题**：之前的纵向表单设计（输入框占满一行，按钮在下一行占满）在桌面端显得笨重，不够精致。

## 选定方案

1.  **针对遮挡问题：统一滚动视口**
    - 在窄屏下，取消 `.workspace-content` 的 `overflow-y: auto`（让它高度自然撑开）。
    - 确保 `.workspace-body` 自身 `overflow-y: auto` 并且 `flex-direction: column`。
    - 这样，`.workspace-main-column` 和 `.workspace-aside` 就成为 `workspace-body` 内部的两个普通块，用户向下滚动整个 `workspace-body` 就能看到底部的最近任务，绝对不会发生重叠。
2.  **针对输入卡问题：横向极致收缩**
    - 在窄屏下，移除 `.url-input-actions` 的 `flex-direction: column`。
    - 让 `.url-input-field` 的 `min-width: 0` 和 `flex: 1` 保持生效，允许它被挤压。
    - 稍微缩小 `.url-input-submit` 的横向 padding。

## 技术实现

### `src/renderer/styles/globals.css`

修改 `@media (max-width: 1100px)` 块内的代码：

-   **统一滚动**：
    -   给 `.workspace-body` 添加 `overflow-y: auto;`。
    -   给 `.workspace-content` 添加 `overflow-y: visible;`（覆盖掉原来宽屏的 auto）。
    -   确保 `.workspace-aside` 的 `min-height: auto`，让它自然撑开。
-   **输入卡横向紧凑**：
    -   移除 `.url-input-actions` 的 `flex-direction: column;` 和 `align-items: stretch;`。
    -   保留 `.url-input-field` 的 `min-width: 0;` 和 `width: 100%;` (配合 flex: 1，这其实会让它尽可能占满剩余空间)。
    -   移除 `.url-input-submit` 的 `width: 100%;` 和 `justify-content: center;`，改为调整 `padding` 比如 `padding: 0 14px;`。

### `tests/ui-theme-source.test.mjs`

更新静态断言，锁定新的布局约束：
-   断言 `@media (max-width: 1100px)` 下 `.workspace-body` 有 `overflow-y: auto;`
-   断言 `@media (max-width: 1100px)` 下 `.url-input-actions` 不包含 `flex-direction: column;`

## 验证标准

- 缩小窗口到 1100px 以下。
- 主工作区和最近任务卡片上下排列，不会发生任何遮挡。
- 鼠标滚轮可以顺滑地从最顶部的欢迎卡滚动到最底部的最近任务卡片。
- 输入链接的输入框和“开始处理”按钮保持在一行内，按钮文字完整，没有被挤出边界。

## 结论

通过统一滚动容器和恢复横向弹性布局，能够以最小的代价解决遮挡和比例失调的问题，恢复界面的精致感。
