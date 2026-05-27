import { contextBridge, ipcRenderer } from 'electron'

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),
    getRecentTasks: () => ipcRenderer.invoke('task:getRecent'),
    getTasks: () => ipcRenderer.invoke('task:getAll'),
    removeRecentTask: (taskId: string) => ipcRenderer.invoke('task:removeRecent', taskId),

    startFeishu: () => ipcRenderer.invoke('feishu:start'),
    stopFeishu: () => ipcRenderer.invoke('feishu:stop'),
    getFeishuStatus: () => ipcRenderer.invoke('feishu:status'),

    processPodcast: (url: string, force = false, taskId?: string) => ipcRenderer.invoke('podcast:process', { url, force, taskId }),
    cancelProcessing: () => ipcRenderer.invoke('podcast:cancel'),
    getRecoveryLogs: () => ipcRenderer.invoke('task:getRecoveryLogs'),

    onStepUpdate: (callback: (step: any) => void) => {
      ipcRenderer.on('podcast:step', (_e, step) => callback(step))
    },
    onLog: (callback: (msg: string) => void) => {
      ipcRenderer.on('log', (_e, msg) => callback(msg))
    },
    onFeishuStatus: (callback: (status: any) => void) => {
      ipcRenderer.on('feishu:status', (_e, status) => callback(status))
    },
    onProcessingChange: (callback: (processing: boolean, url?: string) => void) => {
      ipcRenderer.on('podcast:processing', (_e, p, url) => callback(p, url))
    },
    onTasksChanged: (callback: () => void) => {
      ipcRenderer.on('task:state-changed', () => callback())
    },

    cleanTemp: () => ipcRenderer.invoke('app:cleanTemp'),
    selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    migrateObsidianNotes: () => ipcRenderer.invoke('obsidian:migrateNotes'),
    scanWhisperModels: () => ipcRenderer.invoke('whisper:scanModels'),
    checkWhisperHardware: (modelId: string) => ipcRenderer.invoke('whisper:checkHardware', modelId),

    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
  })
} catch (e) {
  console.error('Preload failed:', e)
}
