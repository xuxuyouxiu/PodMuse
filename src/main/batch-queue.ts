import * as fs from 'fs'
import * as path from 'path'
import { basename, extname } from 'path'
import { processPodcast, fetchPodcastTitle } from './podcast'
import { loadConfig, getUserDataDir } from './config'
import { getActiveProviderConfig } from './ai-providers'
import type { AIProviderConfig } from '../shared/types'
import { platformRegistry } from './platforms'
import { sendNotification } from './notify'
import {
  startRecentTask,
  completeRecentTask,
  failRecentTask,
  stopRecentTask,
} from './recent-task-state'
import type { FeishuState } from '@shared/types'
import type {
  BatchTask,
  BatchTaskStatus,
  BatchQueueStatus,
  BatchQueueSnapshot,
  BatchCompletionSummary,
  BatchInput,
  StepInfo,
} from '@shared/types'

const MAX_CONSECUTIVE_FAILURES = 3

const STEP_TITLES = [
  { title: '解析页面', subtitle: '提取音频' },
  { title: '下载音频', subtitle: '获取文件' },
  { title: '语音转文字', subtitle: 'Whisper' },
  { title: '修正专有名词', subtitle: 'DeepSeek' },
  { title: 'AI 提炼笔记', subtitle: 'DeepSeek' },
]

interface BatchCallbacks {
  onTaskUpdate: (index: number, task: BatchTask) => void
  onQueueStateChange: () => void
  onQueueComplete: (summary: BatchCompletionSummary) => void
  sendStep: (step: StepInfo) => void
  sendLog: (msg: string) => void
  updateRecentState: (updater: (state: FeishuState) => FeishuState) => void
}

interface PersistedQueue {
  tasks: Array<{
    id: string
    source: string
    type: 'file' | 'url'
    status: BatchTaskStatus
    failureReason?: string
    addedAt: number
    title?: string | null
    platform?: string | null
  }>
  status: BatchQueueStatus
}

let idCounter = 0
function nextId(): string {
  return `batch_${Date.now()}_${++idCounter}`
}

function getQueuePath(): string {
  return path.join(getUserDataDir(), 'batch_queue.json')
}

function detectPlatformId(url: string): string | null {
  const adapter = platformRegistry.findAdapter(url)
  return adapter?.id || null
}

export class BatchQueueService {
  private tasks: BatchTask[] = []
  private status: BatchQueueStatus = 'idle'
  private currentIndex = -1
  private consecutiveFailures = 0
  private pauseRequested = false
  private currentAbort: AbortController | null = null
  private startedAt?: number
  private processResolve: (() => void) | null = null

  constructor(private callbacks: BatchCallbacks) {
    this.loadFromDisk()
  }

  get isRunning(): boolean {
    return this.status === 'running'
  }

  get hasActiveQueue(): boolean {
    return this.status === 'running' || this.status === 'paused'
  }

  // ---- Public API ----

  addTasks(items: BatchInput[]): void {
    const newTasks: BatchTask[] = items.map(item => ({
      id: nextId(),
      source: item.source,
      type: item.type,
      status: 'pending' as BatchTaskStatus,
      title: item.type === 'file' ? basename(item.source, extname(item.source)) : null,
      platform: item.type === 'url' ? detectPlatformId(item.source) : null,
      addedAt: Date.now(),
      providerId: item.providerId,
      model: item.model,
    }))

    this.tasks.push(...newTasks)
    this.persist()
    this.callbacks.onQueueStateChange()
  }

  async start(): Promise<void> {
    if (this.tasks.length === 0) return
    if (this.status === 'running') return

    this.status = 'running'
    this.pauseRequested = false
    this.consecutiveFailures = 0
    this.startedAt = Date.now()

    // Find first pending task
    if (this.currentIndex < 0) {
      this.currentIndex = this.tasks.findIndex(t => t.status === 'pending')
    }

    this.persist()
    this.callbacks.onQueueStateChange()
    await this.processNext()
  }

  pause(): void {
    if (this.status !== 'running') return
    this.pauseRequested = true
    this.status = 'paused'

    // Abort current task if any
    if (this.currentAbort && !this.currentAbort.signal.aborted) {
      this.currentAbort.abort()
    }

    this.persist()
    this.callbacks.onQueueStateChange()
  }

  resume(): void {
    if (this.status !== 'paused') return
    this.pauseRequested = false
    this.status = 'running'
    this.persist()
    this.callbacks.onQueueStateChange()

    const safeRun = () => {
      this.processNext().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        this.callbacks.sendLog(`⚠ 队列恢复时发生未捕获异常: ${msg}`)
        console.error('[batch-queue] resume processNext error:', e)
      })
    }

    // If current task was aborted during pause, mark it pending again
    if (this.currentIndex >= 0 && this.currentIndex < this.tasks.length) {
      const task = this.tasks[this.currentIndex]
      if (task.status === 'pending' || task.status === 'processing') {
        // Restart from current position
        safeRun()
        return
      }
    }

    safeRun()
  }

  skipTask(index: number): void {
    if (index < 0 || index >= this.tasks.length) return
    const task = this.tasks[index]
    if (task.status !== 'pending') return

    task.status = 'skipped'
    task.completedAt = Date.now()
    this.callbacks.onTaskUpdate(index, { ...task })
    this.persist()
    this.callbacks.onQueueStateChange()
  }

  clear(): void {
    // Abort current task
    if (this.currentAbort && !this.currentAbort.signal.aborted) {
      this.currentAbort.abort()
    }

    // Mark pending tasks as skipped
    for (let i = 0; i < this.tasks.length; i++) {
      if (this.tasks[i].status === 'pending') {
        this.tasks[i].status = 'skipped'
        this.tasks[i].completedAt = Date.now()
      }
    }

    this.status = 'idle'
    this.pauseRequested = false
    this.currentIndex = -1
    this.consecutiveFailures = 0
    this.tasks = []
    this.persist()
    this.callbacks.onQueueStateChange()
  }

  retryTask(index: number): void {
    if (index < 0 || index >= this.tasks.length) return
    const task = this.tasks[index]
    if (task.status !== 'failed') return

    task.status = 'pending'
    task.failureReason = undefined
    task.completedAt = undefined
    task.filename = undefined
    task.steps = undefined
    this.callbacks.onTaskUpdate(index, { ...task })
    this.persist()
    this.callbacks.onQueueStateChange()
  }

  removeTask(index: number): void {
    if (index < 0 || index >= this.tasks.length) return
    const task = this.tasks[index]
    if (task.status === 'processing') return

    this.tasks.splice(index, 1)
    if (this.currentIndex >= index && this.currentIndex > 0) {
      this.currentIndex--
    }
    this.persist()
    this.callbacks.onQueueStateChange()
  }

  reorderTasks(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= this.tasks.length) return
    if (toIndex < 0 || toIndex >= this.tasks.length) return
    // Only allow reordering pending tasks
    if (this.tasks[fromIndex].status !== 'pending') return

    const [task] = this.tasks.splice(fromIndex, 1)
    this.tasks.splice(toIndex, 0, task)

    // Adjust currentIndex if needed
    if (this.currentIndex >= 0) {
      if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
        this.currentIndex--
      } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
        this.currentIndex++
      }
    }

    this.persist()
    this.callbacks.onQueueStateChange()
  }

  getState(): BatchQueueSnapshot {
    return {
      tasks: this.tasks.map(t => ({ ...t, steps: t.steps ? [...t.steps] : undefined })),
      status: this.status,
      currentIndex: this.currentIndex,
      total: this.tasks.length,
      completed: this.tasks.filter(t => t.status === 'completed').length,
      failed: this.tasks.filter(t => t.status === 'failed').length,
      skipped: this.tasks.filter(t => t.status === 'skipped').length,
      startedAt: this.startedAt,
    }
  }

  // ---- Internal ----

  private async processNext(): Promise<void> {
    // Signal that previous process is done
    if (this.processResolve) {
      this.processResolve()
      this.processResolve = null
    }

    while (this.currentIndex < this.tasks.length) {
      // Check pause
      if (this.pauseRequested || this.status === 'paused') {
        return
      }

      const task = this.tasks[this.currentIndex]

      // Skip already completed/failed/skipped tasks
      if (task.status !== 'pending') {
        this.currentIndex++
        continue
      }

      // Check consecutive failures
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.pauseRequested = true
        this.status = 'paused'
        this.callbacks.sendLog(`⚠ 连续 ${MAX_CONSECUTIVE_FAILURES} 个任务失败，队列已自动暂停`)
        this.persist()
        this.callbacks.onQueueStateChange()
        return
      }

      // Check if local file still exists
      if (task.type === 'file' && !fs.existsSync(task.source)) {
        task.status = 'failed'
        task.failureReason = '源文件已丢失'
        task.completedAt = Date.now()
        this.callbacks.onTaskUpdate(this.currentIndex, { ...task })
        this.consecutiveFailures++
        this.currentIndex++
        this.persist()
        this.callbacks.onQueueStateChange()
        continue
      }

      // Process this task
      await this.processTask(this.currentIndex)
      this.currentIndex++
    }

    // All tasks done
    this.finishQueue()
  }

  private async processTask(index: number): Promise<void> {
    const task = this.tasks[index]
    task.status = 'processing'
    task.steps = []
    this.callbacks.onTaskUpdate(index, { ...task })
    this.callbacks.onQueueStateChange()

    this.currentAbort = new AbortController()
    const signal = this.currentAbort.signal

    // Reset StepPanel to clear stale checkmarks from previous task
    for (let i = 0; i < STEP_TITLES.length; i++) {
      this.callbacks.sendStep({ step: i + 1, ...STEP_TITLES[i], status: 'pending' })
    }

    try {
      // Fetch title for URL tasks
      if (task.type === 'url' && !task.title) {
        const title = await fetchPodcastTitle(task.source).catch(() => null)
        if (title) {
          task.title = title
          this.callbacks.onTaskUpdate(index, { ...task })
        }
      }

      const config = loadConfig()
      let activeProvider = getActiveProviderConfig(config.ai_provider, config.ai_providers)
      // 任务级模型覆盖（历史页重新生成选模型）
      if (task.providerId && task.model) {
        const p = (config.ai_providers as Record<string, AIProviderConfig | undefined> | undefined)?.[
          task.providerId
        ]
        if (p?.apiKey) {
          let baseUrl = p.baseUrl
          if (baseUrl && !baseUrl.includes('/v1')) {
            baseUrl = baseUrl.replace(/\/+$/, '') + '/v1'
          }
          activeProvider = { baseUrl, apiKey: p.apiKey, model: task.model }
          console.log(`[batch] 任务使用指定模型: ${task.providerId}/${task.model}`)
        }
      }
      if (!activeProvider && config.api_key) {
        activeProvider = {
          baseUrl: 'https://api.deepseek.com',
          apiKey: config.api_key,
          model: 'deepseek-chat',
        }
      }

      const isLocalFile = task.type === 'file'

      // Derive episodeId for dedup tracking
      const episodeId =
        task.type === 'url'
          ? platformRegistry.findAdapter(task.source)?.adapter.getDedupKey(task.source) || null
          : null

      // Register in recent tasks system so it shows in history
      this.callbacks.updateRecentState(state =>
        startRecentTask(state, {
          id: task.id,
          url: task.source,
          episodeId,
          title: task.title,
        }),
      )

      // Create per-task step callback
      const stepCallback = (step: StepInfo) => {
        task.steps = task.steps || []
        task.steps[step.step - 1] = { ...step }
        this.callbacks.onTaskUpdate(index, { ...task })
        // Also forward to global step listener for compatibility
        this.callbacks.sendStep(step)
      }

      const processedTitle: { value: string | null } = { value: null }
      const result = await processPodcast(
        task.source,
        activeProvider,
        config.ai_provider,
        config.language,
        config.obsidian_dir,
        config.audio_dir,
        stepCallback,
        (msg: string) => {
          this.callbacks.sendLog(msg)
        },
        signal,
        isLocalFile,
        false,
        processedTitle,
      )

      if (signal.aborted) {
        // Was paused or cleared during processing
        task.status = 'pending'
        task.steps = undefined
        this.callbacks.updateRecentState(state => stopRecentTask(state))
        this.callbacks.onTaskUpdate(index, { ...task })
        return
      }

      if (result) {
        task.status = 'completed'
        task.filename = result
        task.completedAt = Date.now()
        // 回填真实标题（B 站等平台处理时从 API 拿到的标题，覆盖预取的 URL）
        if (processedTitle.value) {
          task.title = processedTitle.value
        }
        this.consecutiveFailures = 0
        this.callbacks.updateRecentState(state =>
          completeRecentTask(state, {
            taskId: task.id,
            url: task.source,
            episodeId,
            filename: result,
            title: processedTitle.value || null,
          }),
        )
        this.callbacks.sendLog(`✓ 完成：${task.title || task.source} → ${result}`)
      } else {
        task.status = 'failed'
        task.failureReason = '处理返回空结果'
        task.completedAt = Date.now()
        this.consecutiveFailures++
        this.callbacks.updateRecentState(state => failRecentTask(state))
        this.callbacks.sendLog(`✗ 失败：${task.title || task.source}`)
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        task.status = 'pending'
        task.steps = undefined
        this.callbacks.updateRecentState(state => stopRecentTask(state))
        this.callbacks.onTaskUpdate(index, { ...task })
        return
      }

      const errMsg = err instanceof Error ? err.message : String(err)
      task.status = 'failed'
      task.failureReason = errMsg
      task.completedAt = Date.now()
      this.consecutiveFailures++
      this.callbacks.updateRecentState(state => failRecentTask(state))
      this.callbacks.sendLog(`✗ 失败：${task.title || task.source} — ${errMsg}`)
    } finally {
      this.currentAbort = null
      task.steps = undefined // Clean up step data after completion
      this.callbacks.onTaskUpdate(index, { ...task })
      this.persist()
      this.callbacks.onQueueStateChange()
    }
  }

  private finishQueue(): void {
    this.status = 'completed'
    const duration = this.startedAt ? Date.now() - this.startedAt : 0

    const summary: BatchCompletionSummary = {
      total: this.tasks.length,
      succeeded: this.tasks.filter(t => t.status === 'completed').length,
      failed: this.tasks.filter(t => t.status === 'failed').length,
      skipped: this.tasks.filter(t => t.status === 'skipped').length,
      duration,
    }

    this.persist()
    this.callbacks.onQueueStateChange()
    this.callbacks.onQueueComplete(summary)

    // System notification
    try {
      const config = loadConfig()
      if (config.notification_enabled !== false) {
        sendNotification(
          'PodMuse',
          `批量处理完成：${summary.succeeded} 成功，${summary.failed} 失败，${summary.skipped} 跳过`,
        )
      }
    } catch {}
  }

  // ---- Persistence ----

  private persistTimer: ReturnType<typeof setTimeout> | null = null

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this._doPersist()
    }, 300)
  }

  /** 应用退出时强制同步写入 */
  forceFlush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this._doPersist()
  }

  private _doPersist(): void {
    try {
      const data: PersistedQueue = {
        tasks: this.tasks.map(t => ({
          id: t.id,
          source: t.source,
          type: t.type,
          status: t.status === 'processing' ? 'pending' : t.status, // Don't persist processing state
          failureReason: t.failureReason,
          addedAt: t.addedAt,
          title: t.title,
          platform: t.platform,
        })),
        status: this.status === 'running' ? 'paused' : this.status, // Running → paused on restart
      }
      fs.writeFileSync(getQueuePath(), JSON.stringify(data), 'utf-8')
    } catch (e) {
      console.error('Failed to persist batch queue:', e)
    }
  }

  private loadFromDisk(): void {
    try {
      const queuePath = getQueuePath()
      if (!fs.existsSync(queuePath)) return

      const raw = fs.readFileSync(queuePath, 'utf-8')
      let data: PersistedQueue
      try {
        data = JSON.parse(raw)
      } catch (parseErr) {
        console.error('Corrupted batch_queue.json, discarding:', parseErr)
        try {
          fs.unlinkSync(queuePath)
        } catch {}
        this.tasks = []
        this.status = 'idle'
        return
      }

      if (!data || !Array.isArray(data.tasks)) {
        try {
          fs.unlinkSync(queuePath)
        } catch {}
        return
      }

      this.tasks = data.tasks.map(t => ({
        ...t,
        completedAt: undefined,
        filename: undefined,
        steps: undefined,
      }))

      // Validate file-type tasks: mark missing files as skipped
      for (const task of this.tasks) {
        if (task.type === 'file' && task.status === 'pending' && !fs.existsSync(task.source)) {
          task.status = 'skipped'
          task.failureReason = '源文件已丢失'
          task.completedAt = Date.now()
        }
      }

      // Any tasks that were "processing" are now "pending" (persist maps processing → pending)
      // Set status to idle - user can resume manually or via startup prompt
      this.status = data.status === 'running' ? 'idle' : data.status || 'idle'
      this.currentIndex = this.tasks.findIndex(t => t.status === 'pending')

      if (this.tasks.length > 0 && this.currentIndex >= 0) {
        this.callbacks.onQueueStateChange()
      }
    } catch (e) {
      console.error('Failed to load batch queue:', e)
      this.tasks = []
      this.status = 'idle'
    }
  }

  /** Check if there are pending tasks from a previous session */
  hasRecoverableTasks(): boolean {
    return this.tasks.some(t => t.status === 'pending' || t.status === 'failed')
  }

  getRecoverableCount(): number {
    return this.tasks.filter(t => t.status === 'pending').length
  }

  /** Get structured recovery info for the startup dialog */
  getRecoveryInfo(): { pending: number; failed: number; total: number; allFailed: boolean } | null {
    if (this.tasks.length === 0) return null
    const pending = this.tasks.filter(t => t.status === 'pending').length
    const failed = this.tasks.filter(t => t.status === 'failed').length
    const completed = this.tasks.filter(t => t.status === 'completed').length
    const skipped = this.tasks.filter(t => t.status === 'skipped').length
    const total = this.tasks.length
    // Only show recovery if there are pending or failed tasks
    if (pending === 0 && failed === 0) return null
    return {
      pending,
      failed,
      total,
      allFailed: pending === 0 && failed > 0 && completed === 0 && skipped === 0,
    }
  }
}
