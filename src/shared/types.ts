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

// ===== OAuth 连接服务（Notion / 飞书）=====
// 凭据（clientSecret/accessToken/refreshToken…）只存在于主进程配置文件；
// config:get 前清空 token 类字段，renderer 永不接触明文 token，
// 只通过 notion:oauthStatus / feishu:oauthStatus 等 IPC 看到连接状态与目标名。

export interface NotionOAuthConfig {
  clientId: string
  clientSecret: string
  accessToken?: string
  workspaceId?: string
  botId?: string
  databaseId?: string
  connectedAt?: number
}

export interface FeishuOAuthConfig {
  appId: string
  appSecret: string
  userAccessToken?: string
  refreshToken?: string
  expiresAt?: number
  chatId?: string
  chatName?: string
  connectedAt?: number
}

/** OAuth 动作/请求的失败分类（绝不携带凭据内容） */
export type OAuthErrorCode =
  | 'oauth_not_configured'
  | 'not_connected'
  | 'auth_in_progress'
  | 'auth_timeout'
  | 'auth_cancelled'
  | 'token_exchange_failed'
  | 'token_expired'
  | 'refresh_failed'
  | 'network_error'

export interface OAuthActionResult {
  success: boolean
  code?: OAuthErrorCode
  error?: string
}

/** renderer 可见的 Notion OAuth 状态（无任何 token 字段） */
export interface NotionOAuthStatus {
  configured: boolean
  connected: boolean
  workspaceId?: string
  databaseId?: string
  connectedAt?: number
}

/** renderer 可见的飞书 OAuth 状态（无任何 token 字段） */
export interface FeishuOAuthStatus {
  configured: boolean
  connected: boolean
  tokenExpired?: boolean
  chatId?: string
  chatName?: string
  connectedAt?: number
}

export interface NotionDatabaseInfo {
  id: string
  title: string
}

export interface FeishuChatInfo {
  id: string
  name: string
}

// 抖音登录状态（主进程闭环，renderer 只读状态与昵称，永不接触 cookie）
export type DouyinLoginStatus = 'connected' | 'unverified' | 'expired'

export interface DouyinLoginState {
  status: DouyinLoginStatus
  nickname?: string
  verifiedAt?: number
}

export interface ExportConfig {
  logseq_dir: string
  notion: NotionConfig
}

// 首次启动向导状态（docs/无感配置方案.md §3.1：每步进展持久化，崩溃/重启后续接）
export interface OnboardingState {
  version: number
  completed: boolean
  /** 下次启动从该步继续（1 AI Key / 2 笔记目录 / 3 Whisper / 4 完成页） */
  lastStep: number
  /** 用户勾选「下次不再提醒」后不再弹向导 */
  neverShowAgain?: boolean
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
  douyin_login?: DouyinLoginState

  // OAuth 连接服务（凭据就绪即可启用；token 唯一写入通道是 notion:oauth* / feishu:oauth* IPC）
  notion_oauth?: NotionOAuthConfig
  feishu_oauth?: FeishuOAuthConfig

  // Notion OAuth 凭据输入（Public integration 的 Client ID/Secret；保存时同步进 notion_oauth）
  notion_oauth_client_id?: string
  notion_oauth_client_secret?: string

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

  // 首次启动向导（缺失/未完成时的弹窗判定见 src/renderer/data/onboarding-logic.ts）
  onboarding?: OnboardingState
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

/** Whisper 一键下载状态（whisper-downloader.ts 维护，主进程→渲染进程事件同步） */
export type WhisperDownloadStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'installed'
  | 'error'
  | 'cancelled'

export interface WhisperDownloadState {
  status: WhisperDownloadStatus
  /** 0-100 */
  progress: number
  /** 人类可读的阶段消息（含下载百分比） */
  message: string
  /** 安装完成后的 faster-whisper-xxl.exe 路径 */
  exePath?: string
  error?: string
}

/** ai:testConnection 错误码（detail 只含状态码与脱敏摘要，绝不携带 apiKey/响应体全文） */
export type AITestCode =
  | 'ok'
  | 'invalid_key'
  | 'no_permission_or_balance'
  | 'bad_url'
  | 'rate_limited'
  | 'network'
  | 'unknown'

export interface AITestResult {
  success: boolean
  code: AITestCode
  detail: string
}

export interface AITestParams {
  baseUrl: string
  apiKey: string
  model: string
  providerId: AIProviderId
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
