import type { FeishuState, RecentTaskState } from '../shared/types.ts'

const MAX_RECENT_TASKS = 500

/**
 * 任务身份标识：按 id / 去重键 / 链接定位任务。
 * 批处理任务可能被一致性巡检（task-recovery）提前从活跃列表移入历史列表，
 * 因此终态回填必须能跨两个列表定位，否则完成/失败/停止的写入会静默丢失。
 */
export interface TaskIdentity {
  taskId?: string
  url?: string
  episodeId?: string | null
  /** 回填到历史记录的标题（失败/停止分支也可携带真实标题） */
  title?: string | null
}

function matchesIdentity(task: RecentTaskState, identity: TaskIdentity): boolean {
  if (identity.taskId && task.id === identity.taskId) return true
  if (identity.episodeId && task.episodeId === identity.episodeId) return true
  if (identity.url && task.url === identity.url) return true
  return false
}

/** 先在活跃列表中查找，找不到再查历史列表（兼容被巡检移走的任务） */
function findTaskInLists(
  state: FeishuState,
  identity?: TaskIdentity,
): { list: 'active' | 'recent'; task: RecentTaskState } | null {
  if (identity) {
    const active = state.activeTasks.find(t => matchesIdentity(t, identity))
    if (active) return { list: 'active', task: active }
    const recent = state.recentTasks.find(t => matchesIdentity(t, identity))
    if (recent) return { list: 'recent', task: recent }
    return null
  }
  const first = state.activeTasks[0]
  return first ? { list: 'active', task: first } : null
}

function updateInList(
  state: FeishuState,
  list: 'active' | 'recent',
  taskId: string,
  patch: Partial<RecentTaskState>,
  opts: { moveToRecent?: boolean } = {},
): FeishuState {
  if (list === 'active') {
    if (opts.moveToRecent) {
      const task = state.activeTasks.find(t => t.id === taskId)
      if (!task) return state
      return {
        ...state,
        activeTasks: state.activeTasks.filter(t => t.id !== taskId),
        recentTasks: normalizeRecentTasks([{ ...task, ...patch }, ...state.recentTasks]),
      }
    }
    return {
      ...state,
      activeTasks: state.activeTasks.map(t => (t.id === taskId ? { ...t, ...patch } : t)),
    }
  }
  return {
    ...state,
    recentTasks: normalizeRecentTasks(
      state.recentTasks.map(t => (t.id === taskId ? { ...t, ...patch } : t)),
    ),
  }
}

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

export function stopRecentTask(state: FeishuState, identity?: TaskIdentity): FeishuState {
  // 停止/暂停的任务保留在当前列表中，不移动到历史列表
  const found = findTaskInLists(state, identity)
  if (!found) return state
  return updateInList(state, found.list, found.task.id, {
    status: 'stopped',
    ...(identity?.title ? { title: identity.title } : {}),
    updatedAt: Date.now(),
  })
}

export function failRecentTask(
  state: FeishuState,
  error?: string,
  identity?: TaskIdentity,
): FeishuState {
  const found = findTaskInLists(state, identity)
  if (!found) return state
  return updateInList(
    state,
    found.list,
    found.task.id,
    {
      status: 'error',
      ...(error ? { error } : {}),
      ...(identity?.title ? { title: identity.title } : {}),
      updatedAt: Date.now(),
    },
    { moveToRecent: true },
  )
}

export function completeRecentTask(
  state: FeishuState,
  input: {
    taskId?: string
    url?: string
    episodeId?: string | null
    filename: string
    /** 处理完成后从平台适配器回填的真实标题（预取失败时为 URL，这里覆盖） */
    title?: string | null
  },
): FeishuState {
  const found = findTaskInLists(state, {
    taskId: input.taskId,
    url: input.url,
    episodeId: input.episodeId,
  })
  if (!found) return state

  const processedUrls =
    found.task.episodeId && !state.processedUrls.includes(found.task.episodeId)
      ? [...state.processedUrls, found.task.episodeId]
      : state.processedUrls

  const updated = updateInList(
    state,
    found.list,
    found.task.id,
    {
      status: 'completed',
      filename: input.filename,
      error: null,
      ...(input.title ? { title: input.title } : {}),
      updatedAt: Date.now(),
    },
    { moveToRecent: true },
  )
  return { ...updated, processedUrls }
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

export interface BatchTaskTerminal {
  id: string
  status: 'completed' | 'failed'
  title?: string | null
  filename?: string | null
  failureReason?: string
}

/**
 * 历史遗留数据对账：批处理队列中已到终态的任务，若其历史记录条目状态不一致
 * （例如处理中被一致性巡检提前标为 stopped，随后的完成写入丢失），
 * 按队列终态回填状态/标题/文件名，并统一归档进历史列表。
 * 仅修复状态与队列不一致的条目；队列里非终态（pending）的任务不触碰，
 * 因为它们可能是崩溃残留，交给任务恢复逻辑处理。
 */
export function reconcileRecentTasksWithBatch(
  state: FeishuState,
  terminalTasks: BatchTaskTerminal[],
): FeishuState {
  if (terminalTasks.length === 0) return state
  const byId = new Map(terminalTasks.map(t => [t.id, t]))
  let changed = false

  const fixTask = (task: RecentTaskState): RecentTaskState => {
    const terminal = byId.get(task.id)
    if (!terminal) return task
    const patch: Partial<RecentTaskState> = {}
    if (terminal.title) patch.title = terminal.title
    if (terminal.filename) patch.filename = terminal.filename
    if (terminal.status === 'failed' && terminal.failureReason) patch.error = terminal.failureReason
    // 批处理队列的 'failed' 对应历史记录的 'error' 状态
    const targetStatus = terminal.status === 'failed' ? 'error' : terminal.status
    if (task.status !== targetStatus) {
      patch.status = targetStatus
    }
    if (Object.keys(patch).length === 0) return task
    changed = true
    return { ...task, ...patch }
  }

  const fixedActive = state.activeTasks.map(fixTask)
  const fixedRecent = state.recentTasks.map(fixTask)
  if (!changed) return state

  // 终态（completed/error）条目统一归档进历史列表
  const archived = fixedActive.filter(t => t.status === 'completed' || t.status === 'error')
  const remainingActive = fixedActive.filter(t => t.status !== 'completed' && t.status !== 'error')
  return {
    ...state,
    activeTasks: remainingActive,
    recentTasks: normalizeRecentTasks([...archived, ...fixedRecent]),
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

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
