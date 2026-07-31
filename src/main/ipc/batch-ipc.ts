import { ipcMain, BrowserWindow } from 'electron'
import type { BatchQueueService } from '../batch-queue'
import type { BatchInput } from '@shared/types'

export function registerBatchIPC(
  mainWindow: BrowserWindow | null,
  service: BatchQueueService,
): void {
  ipcMain.handle('batch:add', (_e, items: BatchInput[]) => {
    service.addTasks(items)
    return service.getState()
  })

  ipcMain.handle('batch:start', async () => {
    await service.start()
    return service.getState()
  })

  ipcMain.handle('batch:pause', () => {
    service.pause()
    return service.getState()
  })

  ipcMain.handle('batch:resume', async () => {
    service.resume()
    return service.getState()
  })

  ipcMain.handle('batch:skip', (_e, index: number) => {
    service.skipTask(index)
    return service.getState()
  })

  ipcMain.handle('batch:clear', () => {
    service.clear()
    return service.getState()
  })

  ipcMain.handle('batch:retry', (_e, index: number) => {
    service.retryTask(index)
    return service.getState()
  })

  ipcMain.handle('batch:remove', (_e, index: number) => {
    service.removeTask(index)
    return service.getState()
  })

  ipcMain.handle('batch:reorder', (_e, fromIndex: number, toIndex: number) => {
    service.reorderTasks(fromIndex, toIndex)
    return service.getState()
  })

  ipcMain.handle('batch:getState', () => {
    return service.getState()
  })

  ipcMain.handle('batch:checkRecovery', () => {
    return service.getRecoveryInfo()
  })

  // Keep reference to mainWindow for event sending (used by callbacks)
  void mainWindow
}
