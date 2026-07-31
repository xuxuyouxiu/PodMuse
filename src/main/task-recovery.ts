import { loadState, saveState } from './config'
import { recoverOrphanedRunningTasks } from './recent-task-state'
import type { RecoveryLogEntry } from '../shared/types'

const MAX_LOG_ENTRIES = 200

let recoveryLogs: RecoveryLogEntry[] = []
let consistencyTimer: ReturnType<typeof setInterval> | null = null

function addLog(entry: RecoveryLogEntry) {
  recoveryLogs.push(entry)
  if (recoveryLogs.length > MAX_LOG_ENTRIES) {
    recoveryLogs = recoveryLogs.slice(-MAX_LOG_ENTRIES)
  }
}

export function getRecoveryLogs(): RecoveryLogEntry[] {
  return recoveryLogs
}

export function runStartupRecovery(logFunc?: (msg: string) => void): RecoveryLogEntry[] {
  const state = loadState()
  const { state: recoveredState, recovered } = recoverOrphanedRunningTasks(state)

  if (recovered.length > 0) {
    saveState(recoveredState)
    for (const item of recovered) {
      const entry: RecoveryLogEntry = {
        timestamp: Date.now(),
        action: 'recover_orphan',
        taskId: item.id,
        url: item.url,
        detail: '软件非正常退出导致的任务残留，已自动恢复为"已停止"状态',
      }
      addLog(entry)
      logFunc?.(`🔄 [任务恢复] ${item.title || item.url || item.id} — 检测到非正常退出，已重置状态`)
    }
  }

  return [...recoveryLogs]
}

export function runConsistencyCheck(
  hasActiveProcess: () => boolean,
  logFunc?: (msg: string) => void,
): number {
  const state = loadState()
  const runningTasks = state.activeTasks.filter(t => t.status === 'running')

  if (runningTasks.length === 0) return 0

  const processAlive = hasActiveProcess()

  if (!processAlive) {
    const { state: recoveredState, recovered } = recoverOrphanedRunningTasks(state)
    if (recovered.length > 0) {
      saveState(recoveredState)
      for (const item of recovered) {
        const entry: RecoveryLogEntry = {
          timestamp: Date.now(),
          action: 'consistency_fix',
          taskId: item.id,
          url: item.url,
          detail: `一致性巡检发现任务状态异常（标记为运行中但无活跃进程），已自动修复`,
        }
        addLog(entry)
        logFunc?.(
          `⚠ [一致性修复] ${item.title || item.url || item.id} — 状态与进程不一致，已自动纠正`,
        )
      }
    }
    return recovered.length
  }

  return 0
}

export function startConsistencyChecker(
  hasActiveProcess: () => boolean,
  logFunc?: (msg: string) => void,
  onInconsistencyFound?: (count: number) => void,
  intervalMs: number = 30000,
): void {
  if (consistencyTimer) return

  consistencyTimer = setInterval(() => {
    const fixed = runConsistencyCheck(hasActiveProcess, logFunc)
    if (fixed > 0) {
      onInconsistencyFound?.(fixed)
    }
  }, intervalMs)
}

export function stopConsistencyChecker(): void {
  if (consistencyTimer) {
    clearInterval(consistencyTimer)
    consistencyTimer = null
  }
}
