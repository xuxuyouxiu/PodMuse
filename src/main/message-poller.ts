import { FeishuClient } from './feishu-client'
import type { FeishuMessage } from './feishu-client'
import { MessageParser } from './message-parser'
import type { MessageTask } from './message-parser'
import { ProcessedMessageStore } from './processed-message-store'
import { PodcastDispatchService } from './podcast-dispatcher'

const POLL_INTERVAL = 30

export class MessagePoller {
  private timer: NodeJS.Timeout | null = null
  private scanning = false
  private baselineReady = false

  constructor(
    private client: FeishuClient,
    private parser: MessageParser,
    private store: ProcessedMessageStore,
    private dispatcher: PodcastDispatchService,
    private chatId: string,
    private logFunc: (msg: string) => void,
    private onStatusChange: () => void,
  ) {}

  get isRunning(): boolean {
    return this.timer !== null
  }

  async start(): Promise<void> {
    if (!await this.client.ensureToken()) {
      this.logFunc('⚠ 飞书连接失败，监听未启动。请检查设置中的飞书 App ID 和 App Secret 是否正确')
      this.onStatusChange()
      return
    }

    this.logFunc('飞书监听器启动中...')
    this.logFunc('✓ 飞书连接正常，开始监听...')
    this.onStatusChange()

    this.tick()
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL * 1000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.logFunc('监听已停止')
    this.onStatusChange()
  }

  private async tick(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      if (!await this.client.ensureToken()) {
        this.logFunc('ensureToken 失败，跳过本次扫描')
        return
      }
      if (!this.chatId) {
        this.logFunc('未配置 chat_id，跳过扫描')
        return
      }

      let messages: FeishuMessage[] = []
      let tasks: MessageTask[] = []
      try {
        messages = await this.client.listMessages(this.chatId)
        tasks = this.parser.extract(messages)
      } catch {
        this.logFunc('⚠️ 飞书任务同步失败，正在使用本地缓存')
        return
      }

      if (!this.baselineReady) {
        for (const task of tasks) {
          this.store.mark(task.id)
        }
        this.store.flush()
        this.baselineReady = true
        this.logFunc('⏸ 首轮扫描只建立消息基线，启动时不自动处理历史消息')
        return
      }

      for (const task of tasks) {
        if (this.store.has(task.id)) {
          continue
        }

        if (task.kind === 'podcast') {
          if (this.store.hasIncompleteRecentTask(task.url!, task.episodeId ?? null)) {
            this.logFunc('⏸ 发现未完成最近任务，已保留在侧边栏，启动时不自动继续处理')
            this.store.mark(task.id)
            continue
          }
          if (task.episodeId && this.store.hasUrl(task.episodeId)) {
            this.logFunc(`⏭ 已处理过该期播客 (${task.episodeId})，跳过`)
            this.store.mark(task.id)
            continue
          }
          this.logFunc(`🔗 发现播客链接: ${(task.url || '').substring(0, 80)}...`)
          this.store.mark(task.id)
          await this.dispatcher.dispatch(task.url!, task.episodeId ?? null)
        } else {
          this.store.mark(task.id)
        }
      }

      this.store.flush()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logFunc(`扫描异常: ${msg}`)
    } finally {
      this.scanning = false
    }
  }
}
