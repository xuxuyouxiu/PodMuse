import type {
  PodcastConfig,
  RecentTaskState,
  TaskListsPayload,
  StepInfo,
  FeishuStatus,
  RecoveryLogEntry,
} from '../shared/types'

interface NoteSearchResult {
  path: string
  name: string
  excerpt: string
  type: string
}

interface WhisperModelInfo {
  id: string
  label: string
  size: string
  downloaded: boolean
  ramMinGB: number
}

interface HardwareCheckResult {
  pass: boolean
  totalRamGB: number
  requiredGB: number
  warning: string | null
}

interface AIModelListResult {
  success: boolean
  models: Array<{ id: string; name: string }>
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<PodcastConfig | null>
      saveConfig: (config: PodcastConfig) => Promise<boolean>
      getRecentTasks: () => Promise<RecentTaskState[]>
      getTasks: () => Promise<TaskListsPayload>
      removeRecentTask: (taskId: string) => Promise<TaskListsPayload>
      startFeishu: () => Promise<FeishuStatus>
      stopFeishu: () => Promise<void>
      getFeishuStatus: () => Promise<FeishuStatus>
      processPodcast: (url: string, force?: boolean, taskId?: string, isLocalFile?: boolean) => Promise<{ success: boolean; filename?: string | null; error?: string }>
      cancelProcessing: () => Promise<boolean>
      onStepUpdate: (callback: (step: StepInfo) => void) => () => void
      onLog: (callback: (msg: string) => void) => () => void
      onFeishuStatus: (callback: (status: FeishuStatus) => void) => () => void
      onProcessingChange: (callback: (processing: boolean, url?: string) => void) => () => void
      onTasksChanged: (callback: () => void) => () => void
      getRecoveryLogs: () => Promise<RecoveryLogEntry[]>
      cleanTemp: () => Promise<boolean>
      searchNotes: (keyword: string) => Promise<NoteSearchResult[]>
      openPath: (filePath: string) => Promise<boolean>
      openExternal: (url: string) => Promise<boolean>
      selectDir: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      scanWhisperModels: () => Promise<WhisperModelInfo[]>
      checkWhisperHardware: (modelId: string) => Promise<HardwareCheckResult>
      fetchAIModels: (baseUrl: string, apiKey: string) => Promise<AIModelListResult>
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      getPathForFile: (file: File) => string
      getAppVersion: () => Promise<string>
    }
  }
}

export {}
