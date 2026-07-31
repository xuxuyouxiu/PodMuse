import type { FeishuState, RecentTaskState } from '../shared/types.ts'

const MAX_RECENT_TASKS = 5

export function startRecentTask(
  state: FeishuState,
  input: {
    id?: string
    url: string
    episodeId: string | null
    title?: string | null
  },
): FeishuState {
  const current = findRecentTask(state, input)
  const nextTask: RecentTaskState = {
    id: current?.id || input.id || createTaskId(),
    url: input.url,
    episodeId: input.episodeId,
    title: input.title ?? current?.title ?? null,
    status: 'running',
    filename: current?.filename ?? null,
    updatedAt: Date.now(),
  }
  return {
    ...state,
    activeTasks: normalizeRecentTasks([
      nextTask,
      ...state.activeTasks.filter(task => task.id !== nextTask.id),
    ]),
    recentTasks: state.recentTasks.filter(task => task.id !== nextTask.id),
  }
}

export function stopRecentTask(state: FeishuState): FeishuState {
  // 停止/暂停的任务保留在活跃列表中，不移动到历史列表
  const activeTask = state.activeTasks[0]
  if (!activeTask) return state
  return {
    ...state,
    activeTasks: state.activeTasks.map(task =>
      task.id === activeTask.id
        ? { ...task, status: 'stopped' as const, updatedAt: Date.now() }
        : task,
    ),
  }
}

export function failRecentTask(state: FeishuState, error?: string): FeishuState {
  return withRecentStatus(state, 'error', error)
}

export function completeRecentTask(
  state: FeishuState,
  input: {
    taskId?: string
    url?: string
    episodeId?: string | null
    filename: string
  },
): FeishuState {
  const activeTask = findTaskByIdentityInActive(state, input)
  if (!activeTask) return state

  const processedUrls =
    activeTask.episodeId && !state.processedUrls.includes(activeTask.episodeId)
      ? [...state.processedUrls, activeTask.episodeId]
      : state.processedUrls

  return {
    ...state,
    processedUrls,
    activeTasks: state.activeTasks.filter(task => task.id !== activeTask.id),
    recentTasks: normalizeRecentTasks([
      { ...activeTask, status: 'completed', filename: input.filename, updatedAt: Date.now() },
      ...state.recentTasks,
    ]),
  }
}

export function shouldAutoResumeRecentTask(_state: FeishuState): boolean {
  return false
}

export function recoverOrphanedRunningTasks(state: FeishuState): {
  state: FeishuState
  recovered: { id: string; url: string; title: string | null | undefined }[]
} {
  const orphaned = state.activeTasks.filter(t => t.status === 'running')
  if (orphaned.length === 0) return { state, recovered: [] }

  const recoveredItems = orphaned.map(t => ({ id: t.id, url: t.url, title: t.title }))
  const updatedState: FeishuState = {
    ...state,
    activeTasks: state.activeTasks.filter(t => t.status !== 'running'),
    recentTasks: normalizeRecentTasks([
      ...orphaned.map(t => ({ ...t, status: 'stopped' as const, updatedAt: Date.now() })),
      ...state.recentTasks,
    ]),
  }
  return { state: updatedState, recovered: recoveredItems }
}

export function getRecentTasks(state: FeishuState): RecentTaskState[] {
  return normalizeRecentTasks([...state.activeTasks, ...state.recentTasks])
}

export function removeRecentTask(state: FeishuState, taskId: string): FeishuState {
  // Find the task being deleted to preserve its episodeId in dedup tracking
  const task =
    state.activeTasks.find(t => t.id === taskId) || state.recentTasks.find(t => t.id === taskId)
  const processedUrls =
    task?.episodeId && !state.processedUrls.includes(task.episodeId)
      ? [...state.processedUrls, task.episodeId]
      : state.processedUrls

  return {
    ...state,
    processedUrls,
    activeTasks: state.activeTasks.filter(t => t.id !== taskId),
    recentTasks: state.recentTasks.filter(t => t.id !== taskId),
  }
}

function withRecentStatus(
  state: FeishuState,
  status: RecentTaskState['status'],
  error?: string,
): FeishuState {
  const activeTask = state.activeTasks[0]
  if (!activeTask) return state
  return {
    ...state,
    activeTasks: state.activeTasks.filter(task => task.id !== activeTask.id),
    recentTasks: normalizeRecentTasks([
      { ...activeTask, status, ...(error ? { error } : {}), updatedAt: Date.now() },
      ...state.recentTasks,
    ]),
  }
}

function normalizeRecentTasks(tasks: RecentTaskState[]): RecentTaskState[] {
  return tasks
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_TASKS)
}

function findRecentTask(state: FeishuState, input: { url: string; episodeId: string | null }) {
  const matchCondition = (task: RecentTaskState) =>
    (input.episodeId && task.episodeId === input.episodeId) || task.url === input.url
  return state.activeTasks.find(matchCondition) || state.recentTasks.find(matchCondition)
}

function findTaskByIdentityInActive(
  state: FeishuState,
  input: {
    taskId?: string
    url?: string
    episodeId?: string | null
  },
) {
  return state.activeTasks.find(
    task =>
      (input.taskId && task.id === input.taskId) ||
      (input.episodeId && task.episodeId === input.episodeId) ||
      (input.url && task.url === input.url),
  ) // No fallback — return undefined if no match found
}

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
