import { ipcMain, BrowserWindow } from 'electron'
import { loadState, saveState } from '../config'
import { getRecentTasks, removeRecentTask } from '../recent-task-state'
import { getRecoveryLogs } from '../task-recovery'

export function registerTaskIPC(mainWindow?: BrowserWindow | null): void {
  ipcMain.handle('task:getRecent', () => {
    return getRecentTasks(loadState())
  })

  ipcMain.handle('task:getAll', () => {
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks
    }
  })

  ipcMain.handle('task:removeRecent', (_event, taskId: string) => {
    const current = loadState()
    const updated = removeRecentTask(current, taskId)
    saveState(updated)
    try { mainWindow?.webContents.send('task:state-changed') } catch {}
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks
    }
  })

  ipcMain.handle('task:getRecoveryLogs', () => {
    return getRecoveryLogs()
  })
}
