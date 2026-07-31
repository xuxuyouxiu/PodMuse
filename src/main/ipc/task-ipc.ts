import { ipcMain, BrowserWindow } from 'electron'
import { loadState, saveState } from '../config'
import { getRecentTasks, removeRecentTask } from '../recent-task-state'
import { getRecoveryLogs } from '../task-recovery'
import { processedEpisodeIds } from '../dedup-store'
import type { FeishuMonitor } from '../feishu'

export function registerTaskIPC(
  mainWindow?: BrowserWindow | null,
  monitor?: FeishuMonitor | null,
): void {
  ipcMain.handle('task:getRecent', () => {
    return getRecentTasks(loadState())
  })

  ipcMain.handle('task:getAll', () => {
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks,
    }
  })

  ipcMain.handle('task:removeRecent', (_event, taskId: string) => {
    const current = loadState()
    // Find the task being deleted so we can sync its episodeId
    const deletedTask =
      current.activeTasks.find(t => t.id === taskId) ||
      current.recentTasks.find(t => t.id === taskId)
    const updated = removeRecentTask(current, taskId)
    saveState(updated)
    // Sync in-memory dedup set with the newly persisted processedUrls
    for (const id of updated.processedUrls) {
      processedEpisodeIds.add(id)
    }
    // Also sync ProcessedMessageStore's in-memory urlIds so flush() won't lose the entry
    if (deletedTask?.episodeId && monitor) {
      monitor.addProcessedUrl(deletedTask.episodeId)
    }
    try {
      mainWindow?.webContents.send('task:state-changed')
    } catch {}
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks,
    }
  })

  ipcMain.handle('task:getRecoveryLogs', () => {
    return getRecoveryLogs()
  })
}
