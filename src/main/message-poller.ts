import { FeishuClient } from './feishu-client'
import { MessageParser } from './message-parser'
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
    if (!await this.client.ensureToken()) return

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

      let messages: any[] = []
      let tasks: any[] = []
      try {
        messages = await this.client.listMessages(this.chatId)
        tasks = this.parser.extract(messages)
      } catch (err: any) {
        this.logFunc('⚠️ 飞书任务同步失败，正在使用本地缓存')
        return
      }
      // #region debug-point H:tick-summary
      ;(()=>{let u='http://127.0.0.1:7777/event',s='feishu-poller-no-response';try{const e=require('fs').readFileSync('.dbg/feishu-poller-no-response.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'H',location:'src/main/message-poller.ts:tick',msg:'[DEBUG] feishu tick summary',data:{chatId:this.chatId,messageCount:messages.length,tasks:tasks.map(task=>({id:task.id,kind:task.kind,url:task.url||null,episodeId:task.episodeId||null,alreadyProcessed:this.store.has(task.id)}))},ts:Date.now()})}).catch(()=>{})})()
      // #endregion

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
          // #region debug-point H:skip-processed
          ;(()=>{let u='http://127.0.0.1:7777/event',s='feishu-poller-no-response';try{const e=require('fs').readFileSync('.dbg/feishu-poller-no-response.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'H',location:'src/main/message-poller.ts:tick',msg:'[DEBUG] feishu skip processed message',data:{taskId:task.id,kind:task.kind,url:task.url||null},ts:Date.now()})}).catch(()=>{})})()
          // #endregion
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
    } catch (e: any) {
      this.logFunc(`扫描异常: ${e.message}`)
    } finally {
      this.scanning = false
    }
  }
}
