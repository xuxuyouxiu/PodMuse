// AI 供应商类型
export type AIProviderId =
  | 'deepseek'
  | 'openai'
  | 'moonshot'
  | 'zhipu'
  | 'qwen'
  | 'yi'
  | 'minimax'
  | 'custom'

// 供应商模型配置
export interface AIModelConfig {
  id: string
  name: string
  maxTokens?: number
  temperature?: number
}

// 供应商配置
export interface AIProviderConfig {
  id: AIProviderId
  name: string
  apiKey: string
  baseUrl: string
  model: string
  availableModels: AIModelConfig[]
  website?: string
  description?: string
  isCustom?: boolean
}

// 预设供应商信息
export interface AIProviderPreset {
  id: AIProviderId
  name: string
  baseUrl: string
  defaultModel: string
  availableModels: AIModelConfig[]
  website: string
  description: string
  apiKeyPlaceholder?: string
  apiKeyUrl?: string
}

export interface NotionConfig {
  token: string
  database_id: string
}

export interface ExportConfig {
  logseq_dir: string
  notion: NotionConfig
}

export interface PodcastConfig {
  // AI 供应商配置（新增）
  ai_provider: AIProviderId
  ai_providers: Record<AIProviderId, AIProviderConfig>

  // 旧字段保留兼容
  api_key: string

  feishu_app_id: string
  feishu_app_secret: string
  language: 'zh' | 'en' | 'auto'
  feishu_chat_id: string
  obsidian_dir: string
  audio_dir: string
  whisper_exe_path: string
  whisper_model: string
  notification_enabled: boolean

  // 导出配置（可选，向后兼容）
  export?: ExportConfig
}

export interface FeishuState {
  processed: string[]
  processedUrls: string[]
  activeTasks: RecentTaskState[]
  recentTasks: RecentTaskState[]
}

export type RecentTaskStatus = 'running' | 'stopped' | 'error' | 'completed'

export interface RecentTaskState {
  id: string
  url: string
  episodeId: string | null
  status: RecentTaskStatus
  title?: string | null
  filename?: string | null
  error?: string | null
  updatedAt: number
}

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'stopped'

export interface StepInfo {
  step: number
  title: string
  subtitle: string
  status: StepStatus
  detail?: string
  progress?: number
}

export interface FeishuStatus {
  connected: boolean
  monitoring: boolean
  chatId: string
}

export interface TaskListsPayload {
  activeTasks: RecentTaskState[]
  recentTasks: RecentTaskState[]
}

export interface RecoveryLogEntry {
  timestamp: number
  action: 'recover_orphan' | 'consistency_fix'
  taskId: string
  url: string
  detail: string
}

// ===== 批量处理 =====

export type BatchTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

export type BatchQueueStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface BatchInput {
  source: string
  type: 'file' | 'url'
}

export interface BatchTask {
  id: string
  source: string
  type: 'file' | 'url'
  status: BatchTaskStatus
  title?: string | null
  platform?: string | null
  failureReason?: string
  addedAt: number
  completedAt?: number
  filename?: string | null
  steps?: StepInfo[]
}

export interface BatchQueueSnapshot {
  tasks: BatchTask[]
  status: BatchQueueStatus
  currentIndex: number
  total: number
  completed: number
  failed: number
  skipped: number
  startedAt?: number
}

export interface BatchCompletionSummary {
  total: number
  succeeded: number
  failed: number
  skipped: number
  duration: number
}
