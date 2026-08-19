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
  douyin_cookie: string

  // 导出配置（可选，向后兼容）
  export?: ExportConfig

  // RSS 订阅
  subscriptions?: Subscription[]
  subscription_check_interval_hours?: number
  rsshub_base_url?: string

  // 自动更新
  auto_update_check?: boolean
  auto_update_download?: boolean

  // YouTube 订阅镜像（Invidious 实例，如 https://yewtu.be；空 = 直连）
  youtube_mirror_base?: string

  // 剪贴板链接检测（浏览器剪藏）
  clipboard_watch_enabled?: boolean
}

export interface Subscription {
  id: string
  name: string
  url: string
  autoProcess: boolean
  enabled: boolean
  createdAt: number
  processedCount: number
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
  /** 入队时已确知的任务标题（订阅 RSS 解析/手动入队时携带），避免处理前显示「识别标题中」 */
  title?: string | null
  /** 模型覆盖（历史页重新生成选模型）：指定 providerId + model 时该任务不用全局配置 */
  providerId?: string
  model?: string
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
  providerId?: string
  model?: string
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
