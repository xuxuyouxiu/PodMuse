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

    processPodcast: (url: string, force = false, taskId?: string, isLocalFile = false) => ipcRenderer.invoke('podcast:process', { url, force, taskId, isLocalFile }),
    cancelProcessing: () => ipcRenderer.invoke('podcast:cancel'),
    getRecoveryLogs: () => ipcRenderer.invoke('task:getRecoveryLogs'),

    onStepUpdate: (callback: (step: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, step: unknown) => callback(step)
      ipcRenderer.on('podcast:step', handler)
      return () => { ipcRenderer.removeListener('podcast:step', handler) }
    },
    onLog: (callback: (msg: string) => void) => {
      const handler = (_e: IpcRendererEvent, msg: string) => callback(msg)
      ipcRenderer.on('log', handler)
      return () => { ipcRenderer.removeListener('log', handler) }
    },
    onFeishuStatus: (callback: (status: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, status: unknown) => callback(status)
      ipcRenderer.on('feishu:status', handler)
      return () => { ipcRenderer.removeListener('feishu:status', handler) }
    },
    onProcessingChange: (callback: (processing: boolean, url?: string) => void) => {
      const handler = (_e: IpcRendererEvent, p: boolean, url?: string) => callback(p, url)
      ipcRenderer.on('podcast:processing', handler)
      return () => { ipcRenderer.removeListener('podcast:processing', handler) }
    },
    onTasksChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('task:state-changed', handler)
      return () => { ipcRenderer.removeListener('task:state-changed', handler) }
    },

    cleanTemp: () => ipcRenderer.invoke('app:cleanTemp'),
    searchNotes: (keyword: string) => ipcRenderer.invoke('search:notes', keyword),
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    scanWhisperModels: () => ipcRenderer.invoke('whisper:scanModels'),
    checkWhisperHardware: (modelId: string) => ipcRenderer.invoke('whisper:checkHardware', modelId),
    fetchAIModels: (baseUrl: string, apiKey: string) => ipcRenderer.invoke('ai:fetchModels', { baseUrl, apiKey }),

    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  })
} catch (e) {
  console.error('Preload failed:', e)
}
