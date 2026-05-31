declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<any>
      saveConfig: (config: any) => Promise<boolean>
      getRecentTasks: () => Promise<any>
      getTasks: () => Promise<{ activeTasks: any[], recentTasks: any[] }>
      removeRecentTask: (taskId: string) => Promise<any>
      startFeishu: () => Promise<any>
      stopFeishu: () => Promise<any>
      getFeishuStatus: () => Promise<any>
      processPodcast: (url: string, force?: boolean, taskId?: string, isLocalFile?: boolean) => Promise<any>
      cancelProcessing: () => Promise<boolean>
      onStepUpdate: (callback: (step: any) => void) => void
      onLog: (callback: (msg: string) => void) => void
      onFeishuStatus: (callback: (status: any) => void) => void
      onProcessingChange: (callback: (processing: boolean, url?: string) => void) => void
      onTasksChanged: (callback: () => void) => void
      getRecoveryLogs: () => Promise<any[]>
      cleanTemp: () => Promise<boolean>
      searchNotes: (keyword: string) => Promise<Array<{ path: string; name: string; excerpt: string; type: string }>>
      openPath: (filePath: string) => Promise<boolean>
      selectDir: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      scanWhisperModels: () => Promise<Array<{ id: string; label: string; size: string; downloaded: boolean; ramMinGB: number }>>
      checkWhisperHardware: (modelId: string) => Promise<{ pass: boolean; totalRamGB: number; requiredGB: number; warning: string | null }>
      fetchAIModels: (baseUrl: string, apiKey: string) => Promise<{ success: boolean; models: Array<{ id: string; name: string }>; error?: string }>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      getPathForFile: (file: File) => string
      getAppVersion: () => Promise<string>
    }
  }
}

export {}
