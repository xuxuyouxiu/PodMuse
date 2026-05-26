# 任务列表架构拆分设计

日期：2026-05-26

## 目标

- 将原有的单一任务列表（`recentTasks`）从底层数据结构上拆分为两张独立的表：`activeTasks`（活跃任务）和 `recentTasks`（最近任务/历史任务）。
- 明确任务流转逻辑：新任务进入活跃列表，完成后移入历史列表。
- 完善飞书拉取降级策略，在网络异常时提供静默降级与友好的日志提示。

## 范围

- **数据层**：修改 `src/shared/types.ts` 和 `src/main/config.ts`，在 `FeishuState` 中新增 `activeTasks`。
- **状态管理层**：修改 `src/main/recent-task-state.ts`，重构状态更新函数，实现跨表迁移（如从 active 移到 recent）。
- **轮询控制层**：优化 `src/main/message-poller.ts`，处理飞书拉取异常时的降级逻辑。
- **IPC 接口与 UI**：扩展获取任务列表的 IPC 通道，允许前端分别获取活跃任务和历史任务（本期核心在底层逻辑，UI 若需同步拆分两卡片则在后续迭代）。

不在本次范围内：

- 修改现有的 Whisper 处理或笔记生成逻辑。
- 解决“删除笔记后重跑”问题（因为经分析，当前系统基于 `processedUrls` 记录状态，不依赖文件存在性，该风险天然不存在）。

## 数据结构设计

修改 `FeishuState` 接口：
```typescript
export interface FeishuState {
  processed: string[]
  processedUrls: string[]
  activeTasks: RecentTaskState[]  // 新增：存放 pending, running, cancelling 的任务
  recentTasks: RecentTaskState[]  // 现存：存放 completed, error, stopped 的历史任务
}
```

## 核心业务逻辑流转

1. **新建任务（startTask）**：
   - 检查 `activeTasks` 和 `recentTasks` 是否已存在该任务。
   - 如果是全新的，创建并推入 `activeTasks` 顶部。
   - 状态设为 `running`。

2. **任务完成/失败/停止（complete/fail/stop）**：
   - 从 `activeTasks` 中查找到该任务并**移除**。
   - 更新其状态（`completed` / `error` / `stopped`），并更新 `updatedAt` 和相关字段（如 `filename`）。
   - 将更新后的任务推入 `recentTasks` 的顶部。
   - 维护 `recentTasks` 的最大长度（例如 50 条，或按需配置）。

3. **飞书拉取与降级策略**：
   - 在 `message-poller.ts` 中，调用 `listMessages` 时使用 `try/catch` 捕获网络异常。
   - **异常处理**：若捕获到错误，向界面发送日志：“⚠️ 飞书任务同步失败，正在使用本地缓存”，并静默返回。软件将自然依赖当前加载在内存中的 `activeTasks` 继续工作，不会中断主进程。

## 验证标准

- **数据隔离**：启动时或任务状态变化时，`activeTasks` 中绝对不包含 `completed` 状态的任务。
- **平滑迁移**：当一个处于 `running` 的任务处理完毕，它能立即从活跃列表消失，并出现在最近任务列表中。
- **降级有效**：断开网络或模拟飞书接口报错时，程序不崩溃，界面能收到黄色的警告日志，且本地未完成的任务不受影响。

## 结论

物理拆分两张表从根本上解决了任务状态混淆的问题，使得“待办”与“历史”的边界极其清晰，为后续 UI 层的双卡片展示提供了坚实的数据基础。
