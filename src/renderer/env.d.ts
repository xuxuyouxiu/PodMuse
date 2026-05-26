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
      processPodcast: (url: string, force?: boolean, taskId?: string) => Promise<any>
      cancelProcessing: () => Promise<boolean>
      onStepUpdate: (callback: (step: any) => void) => void
      onLog: (callback: (msg: string) => void) => void
      onFeishuStatus: (callback: (status: any) => void) => void
      onProcessingChange: (callback: (processing: boolean, url?: string) => void) => void
      cleanTemp: () => Promise<boolean>
      selectDir: () => Promise<string | null>
      migrateObsidianNotes: () => Promise<{ scanned: number; moved: number; renamed: number; skipped: number; errors: string[] }>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
    }
  }
}

export {}
