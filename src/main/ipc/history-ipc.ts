/**
 * 处理历史 IPC — 历史记录页：列表/删除/清空/重新生成
 */

import { ipcMain } from 'electron'
import { loadState, saveState } from '../config'
import { getRecentTasks, removeRecentTask } from '../recent-task-state'
import { platformRegistry } from '../platforms'
import { processedEpisodeIds } from '../dedup-store'
import type { BatchQueueService } from '../batch-queue'
import type { FeishuState, RecentTaskState } from '../../shared/types'

export interface HistoryEntry {
  id: string
  url: string
  title: string | null
  status: RecentTaskState['status']
  filename: string | null
  platform: string
  platformName: string
  updatedAt: number
  error?: string
}

function toHistoryEntry(task: RecentTaskState): HistoryEntry {
  const info = platformRegistry.findAdapter(task.url)
  return {
    id: task.id,
    url: task.url,
    title: task.title ?? null,
    status: task.status,
    filename: task.filename ?? null,
    platform: info?.id ?? 'other',
    platformName: info?.name ?? '其他',
    updatedAt: task.updatedAt,
    error: task.error ?? undefined,
  }
}

export function registerHistoryIPC(batchQueue: BatchQueueService | null): void {
  ipcMain.handle('history:list', () => {
    const tasks = getRecentTasks(loadState())
    return tasks.map(toHistoryEntry)
  })

  ipcMain.handle('history:remove', (_e, taskId: string) => {
    const current = loadState()
    const updated = removeRecentTask(current, taskId || '')
    saveState(updated)
    for (const id of updated.processedUrls) {
      processedEpisodeIds.add(id)
    }
    return true
  })

  ipcMain.handle('history:clear', () => {
    const current = loadState()
    const updated: FeishuState = {
      ...current,
      recentTasks: [],
    }
    saveState(updated)
    return true
  })

  ipcMain.handle(
    'history:reprocess',
    async (_e, params: { url: string }) => {
      const url = params?.url?.trim() || ''
      if (!url) return { success: false, error: '缺少链接' }
      if (!batchQueue) return { success: false, error: '处理队列未就绪' }
      try {
        batchQueue.addTasks([{ source: url, type: 'url' }])
        await batchQueue.start()
        return { success: true }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
}
