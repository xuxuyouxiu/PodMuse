import type {
  PodcastConfig,
  RecentTaskState,
  TaskListsPayload,
  StepInfo,
  FeishuStatus,
  RecoveryLogEntry,
  BatchTask,
  BatchQueueSnapshot,
  BatchCompletionSummary,
  BatchInput,
} from '../shared/types'

interface NoteSearchResult {
  path: string
  name: string
  excerpt: string
  type: string
}

interface NoteFileEntry {
  name: string
  path: string
  relPath: string
  mtime: number
}

interface NoteDirGroup {
  dir: string
  files: NoteFileEntry[]
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
  interface PodcastRef {
    path: string
    title: string
    date?: string
    category?: string
    show?: string
    episode?: string
    context?: string
  }

  interface BacklinkEntry {
    entityName: string
    entityType: 'people' | 'projects' | 'concepts' | 'terms'
    podcastRefs: PodcastRef[]
  }

  interface TagPodcastRef {
    path: string
    title: string
    date?: string
    category?: string
    show?: string
    tags: string[]
  }

  interface TagEntry {
    tagName: string
    count: number
    podcastRefs: TagPodcastRef[]
  }

  interface YtDlpStatus {
    available: boolean
    path: string | null
    version: string | null
    outdated: boolean
  }

  interface SearchParams {
    keyword?: string
    filters?: {
      category?: string
      tags?: string[]
      show?: string
      dateFrom?: string
      dateTo?: string
      entityRefs?: string[]
    }
    sortBy?: 'score' | 'date_desc' | 'date_asc'
    limit?: number
    offset?: number
  }

  interface SearchResult {
    path: string
    title: string
    date?: string
    category?: string
    show?: string
    tags: string[]
    excerpt: string
    matchType: ('title' | 'content' | 'tags')[]
    score: number
  }

  interface SearchFacets {
    categories: { value: string; count: number }[]
    tags: { value: string; count: number }[]
    shows: { value: string; count: number }[]
    dateRange: { earliest?: string; latest?: string }
    topEntities: { value: string; type: string; count: number }[]
  }

  interface SearchResponse {
    results: SearchResult[]
    total: number
    facets: SearchFacets
  }

  interface ExportParams {
    taskId: string
    target: 'markdown' | 'logseq' | 'notion'
    targetDir?: string
    stripObsidianSyntax?: boolean
  }

  interface ExportResult {
    success: boolean
    outputPath?: string
    pageUrl?: string
    pageId?: string
    error?: string
  }

  interface NotionTestConnectionParams {
    token: string
    databaseId: string
  }

  interface NotionTestConnectionResult {
    success: boolean
    databaseTitle?: string
    error?: string
  }

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
      testFeishuConnection: (params: {
        appId: string
        appSecret: string
        chatId: string
      }) => Promise<{ success: boolean; message: string }>
      douyinLogin: () => Promise<string>
      douyinSetup: () => Promise<{ success: boolean; error?: string; path?: string }>
      processPodcast: (
        url: string,
        force?: boolean,
        taskId?: string,
        isLocalFile?: boolean,
      ) => Promise<{ success: boolean; filename?: string | null; error?: string }>
      checkProcessed: (url: string) => Promise<boolean>
      cancelProcessing: () => Promise<boolean>
      onStepUpdate: (callback: (step: StepInfo) => void) => () => void
      onLog: (callback: (msg: string) => void) => () => void
      onFeishuStatus: (callback: (status: FeishuStatus) => void) => () => void
      onProcessingChange: (callback: (processing: boolean, url?: string) => void) => () => void
      onTasksChanged: (callback: () => void) => () => void
      onToast: (
        callback: (toast: { message: string; type: 'success' | 'error' }) => void,
      ) => () => void
      getRecoveryLogs: () => Promise<RecoveryLogEntry[]>
      cleanTemp: () => Promise<boolean>
      searchNotes: (keyword: string) => Promise<NoteSearchResult[]>
      searchEnhanced: (params: SearchParams) => Promise<SearchResponse>
      searchFacets: () => Promise<SearchFacets>
      openPath: (filePath: string) => Promise<boolean>
      readNote: (filePath: string) => Promise<{ success: boolean; content?: string; filename?: string; error?: string }>
      listNotes: () => Promise<{ success: boolean; groups?: NoteDirGroup[]; rootDir?: string | null; error?: string }>
      openExternal: (url: string) => Promise<boolean>
      selectDir: () => Promise<string | null>
      selectFile: () => Promise<string | null>
      scanWhisperModels: () => Promise<WhisperModelInfo[]>
      checkWhisperHardware: (modelId: string) => Promise<HardwareCheckResult>
      autoDetectWhisper: () => Promise<{ path: string | null; error?: string }>
      fetchAIModels: (baseUrl: string, apiKey: string) => Promise<AIModelListResult>
      detectYtDlp: () => Promise<YtDlpStatus>
      getBacklinkIndex: () => Promise<BacklinkEntry[]>
      getTagIndex: () => Promise<TagEntry[]>
      showInFolder: (filePath: string) => Promise<boolean>

      // 导出
      exportToMarkdown: (params: {
        taskId: string
        targetDir: string
        stripObsidianSyntax?: boolean
      }) => Promise<ExportResult>
      exportToLogseq: (taskId: string) => Promise<ExportResult>
      exportToNotion: (taskId: string) => Promise<ExportResult>
      testNotionConnection: (
        params: NotionTestConnectionParams,
      ) => Promise<NotionTestConnectionResult>

      // 批量处理
      batchAdd: (items: BatchInput[]) => Promise<BatchQueueSnapshot>
      batchStart: () => Promise<BatchQueueSnapshot>
      batchPause: () => Promise<BatchQueueSnapshot>
      batchResume: () => Promise<BatchQueueSnapshot>
      batchSkip: (index: number) => Promise<BatchQueueSnapshot>
      batchClear: () => Promise<BatchQueueSnapshot>
      batchRetry: (index: number) => Promise<BatchQueueSnapshot>
      batchRemove: (index: number) => Promise<BatchQueueSnapshot>
      batchReorder: (from: number, to: number) => Promise<BatchQueueSnapshot>
      batchGetState: () => Promise<BatchQueueSnapshot>
      batchCheckRecovery: () => Promise<{
        pending: number
        failed: number
        total: number
        allFailed: boolean
      } | null>
      onBatchTaskUpdate: (callback: (index: number, task: BatchTask) => void) => () => void
      onBatchQueueState: (callback: (state: BatchQueueSnapshot) => void) => () => void
      onBatchQueueComplete: (callback: (summary: BatchCompletionSummary) => void) => () => void

      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      getPathForFile: (file: File) => string
      getAppVersion: () => Promise<string>
    }
  }
}

export {}
