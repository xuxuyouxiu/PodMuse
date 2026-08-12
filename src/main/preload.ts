import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
    getRecentTasks: () => ipcRenderer.invoke('task:getRecent'),
    getTasks: () => ipcRenderer.invoke('task:getAll'),
    removeRecentTask: (taskId: string) => ipcRenderer.invoke('task:removeRecent', taskId),

    startFeishu: () => ipcRenderer.invoke('feishu:start'),
    stopFeishu: () => ipcRenderer.invoke('feishu:stop'),
    getFeishuStatus: () => ipcRenderer.invoke('feishu:status'),
    testFeishuConnection: (params: { appId: string; appSecret: string; chatId: string }) =>
      ipcRenderer.invoke('feishu:testConnection', params),
    douyinLogin: () => ipcRenderer.invoke('douyin:login'),
    douyinSetup: () => ipcRenderer.invoke('douyin:setup'),

    processPodcast: (url: string, force = false, taskId?: string, isLocalFile = false) =>
      ipcRenderer.invoke('podcast:process', { url, force, taskId, isLocalFile }),
    checkProcessed: (url: string) => ipcRenderer.invoke('podcast:checkProcessed', url),
    cancelProcessing: () => ipcRenderer.invoke('podcast:cancel'),
    getRecoveryLogs: () => ipcRenderer.invoke('task:getRecoveryLogs'),

    onStepUpdate: (callback: (step: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, step: unknown) => callback(step)
      ipcRenderer.on('podcast:step', handler)
      return () => {
        ipcRenderer.removeListener('podcast:step', handler)
      }
    },
    onLog: (callback: (msg: string) => void) => {
      const handler = (_e: IpcRendererEvent, msg: string) => callback(msg)
      ipcRenderer.on('log', handler)
      return () => {
        ipcRenderer.removeListener('log', handler)
      }
    },
    onFeishuStatus: (callback: (status: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, status: unknown) => callback(status)
      ipcRenderer.on('feishu:status', handler)
      return () => {
        ipcRenderer.removeListener('feishu:status', handler)
      }
    },
    onProcessingChange: (callback: (processing: boolean, url?: string) => void) => {
      const handler = (_e: IpcRendererEvent, p: boolean, url?: string) => callback(p, url)
      ipcRenderer.on('podcast:processing', handler)
      return () => {
        ipcRenderer.removeListener('podcast:processing', handler)
      }
    },
    onTasksChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('task:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('task:state-changed', handler)
      }
    },
    onToast: (callback: (toast: { message: string; type: 'success' | 'error' }) => void) => {
      const handler = (_e: unknown, toast: { message: string; type: 'success' | 'error' }) =>
        callback(toast)
      ipcRenderer.on('toast', handler)
      return () => {
        ipcRenderer.removeListener('toast', handler)
      }
    },

    cleanTemp: () => ipcRenderer.invoke('app:cleanTemp'),
    searchNotes: (keyword: string) => ipcRenderer.invoke('search:notes', keyword),
    searchEnhanced: (params: unknown) => ipcRenderer.invoke('search:enhanced', params),
    searchFacets: () => ipcRenderer.invoke('search:facets'),
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    readNote: (filePath: string) => ipcRenderer.invoke('notes:read', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    scanWhisperModels: () => ipcRenderer.invoke('whisper:scanModels'),
    checkWhisperHardware: (modelId: string) => ipcRenderer.invoke('whisper:checkHardware', modelId),
    autoDetectWhisper: () => ipcRenderer.invoke('whisper:autoDetect'),
    fetchAIModels: (baseUrl: string, apiKey: string) =>
      ipcRenderer.invoke('ai:fetchModels', { baseUrl, apiKey }),
    detectYtDlp: () => ipcRenderer.invoke('platform:detectYtDlp'),
    getBacklinkIndex: () => ipcRenderer.invoke('backlinks:index'),
    getTagIndex: () => ipcRenderer.invoke('tags:getIndex'),
    showInFolder: (filePath: string) => ipcRenderer.invoke('shell:showInFolder', filePath),

    // 导出
    exportToMarkdown: (params: {
      taskId: string
      targetDir: string
      stripObsidianSyntax?: boolean
    }) => ipcRenderer.invoke('export:toMarkdown', params),
    exportToLogseq: (taskId: string) => ipcRenderer.invoke('export:toLogseq', { taskId }),
    exportToNotion: (taskId: string) => ipcRenderer.invoke('export:toNotion', { taskId }),
    testNotionConnection: (params: { token: string; databaseId: string }) =>
      ipcRenderer.invoke('export:notion:testConnection', params),

    // 批量处理
    batchAdd: (items: unknown[]) => ipcRenderer.invoke('batch:add', items),
    batchStart: () => ipcRenderer.invoke('batch:start'),
    batchPause: () => ipcRenderer.invoke('batch:pause'),
    batchResume: () => ipcRenderer.invoke('batch:resume'),
    batchSkip: (index: number) => ipcRenderer.invoke('batch:skip', index),
    batchClear: () => ipcRenderer.invoke('batch:clear'),
    batchRetry: (index: number) => ipcRenderer.invoke('batch:retry', index),
    batchRemove: (index: number) => ipcRenderer.invoke('batch:remove', index),
    batchReorder: (from: number, to: number) => ipcRenderer.invoke('batch:reorder', from, to),
    batchGetState: () => ipcRenderer.invoke('batch:getState'),
    batchCheckRecovery: () => ipcRenderer.invoke('batch:checkRecovery'),
    onBatchTaskUpdate: (callback: (index: number, task: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, index: number, task: unknown) => callback(index, task)
      ipcRenderer.on('batch:task-update', handler)
      return () => {
        ipcRenderer.removeListener('batch:task-update', handler)
      }
    },
    onBatchQueueState: (callback: (state: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, state: unknown) => callback(state)
      ipcRenderer.on('batch:queue-state', handler)
      return () => {
        ipcRenderer.removeListener('batch:queue-state', handler)
      }
    },
    onBatchQueueComplete: (callback: (summary: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, summary: unknown) => callback(summary)
      ipcRenderer.on('batch:queue-complete', handler)
      return () => {
        ipcRenderer.removeListener('batch:queue-complete', handler)
      }
    },

    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  })
} catch (e) {
  console.error('Preload failed:', e)
}
