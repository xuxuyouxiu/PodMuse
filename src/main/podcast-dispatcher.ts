import { processPodcast, fetchPodcastTitle } from './podcast'
import { FeishuClient } from './feishu-client'
import { ProcessedMessageStore } from './processed-message-store'
import { loadState, saveState } from './config'
import { completeRecentTask, failRecentTask, startRecentTask, stopRecentTask } from './recent-task-state'
import { sendNotification } from './notify'
import type { StepInfo } from '@shared/types'

const STEP_TITLES = ['解析页面', '下载音频', '语音转文字', '修正专有名词', 'AI 提炼笔记']

export class PodcastDispatchService {
  private processing = false
  private _batchMode = false
  abortRef: AbortController | null = null

  get batchMode(): boolean { return this._batchMode }
  set batchMode(v: boolean) { this._batchMode = v }

  private updateRecentState(updater: (state: ReturnType<typeof loadState>) => ReturnType<typeof loadState>) {
    const current = loadState()
    saveState(updater(current))
    this.onStateChanged?.()
  }

  constructor(
    private client: FeishuClient,
    private store: ProcessedMessageStore,
    private chatId: string,
    private providerConfig: { baseUrl: string; apiKey: string; model: string } | null,
    private providerId: string,
    private language: string,
    private obsidianDir: string,
    private audioDir: string,
    private logFunc: (msg: string) => void,
    private stepFunc?: (step: StepInfo) => void,
    private processingFunc?: (p: boolean, url?: string) => void,
    private onStateChanged?: () => void,
    private notificationEnabled: boolean = true,
  ) {}

  async dispatch(url: string, episodeId: string | null): Promise<void> {
    if (this._batchMode) {
      this.logFunc('⏳ 批量处理中，飞书消息稍后处理')
      return
    }
    if (this.processing) {
      this.logFunc('⏳ 上一个播客还在处理中，本条稍后轮询时处理')
      return
    }
    const initialTitle = await fetchPodcastTitle(url).catch(() => null)
    this.updateRecentState(state => startRecentTask(state, { url, episodeId, title: initialTitle }))
    this.processing = true
    this.processingFunc?.(true, url)
    this.abortRef = new AbortController()
    const signal = this.abortRef.signal
    try {
      await this.client.sendMessage(this.chatId, '收到！开始处理播客...')
      const filename = await processPodcast(url, this.providerConfig, this.providerId, this.language, this.obsidianDir, this.audioDir, this.stepFunc, this.logFunc, signal, false)
      if (filename) {
        if (episodeId) this.store.markUrl(episodeId)
        this.updateRecentState(state => completeRecentTask(state, { url, episodeId, filename }))
        await this.client.sendMessage(this.chatId, `笔记已生成！\n文件：${filename}\n位置：Obsidian → 小宇宙播客`)
        if (this.notificationEnabled) {
          sendNotification('播客笔记助手', `笔记已生成：${filename}`)
        }
      } else {
        this.updateRecentState(state => failRecentTask(state))
        await this.client.sendMessage(this.chatId, '处理失败，请检查日志。')
        if (this.notificationEnabled) {
          sendNotification('播客笔记助手', '处理失败，请检查日志')
        }
      }
    } catch (e: unknown) {
      if (signal.aborted) {
        this.updateRecentState(state => stopRecentTask(state))
        this.logFunc('■ 处理已取消')
        for (let i = 1; i <= 5; i++) {
          this.stepFunc?.({ step: i, title: STEP_TITLES[i - 1], subtitle: '已取消', status: 'stopped' as const, detail: '用户取消了处理' })
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        this.updateRecentState(state => failRecentTask(state))
        this.logFunc(`处理异常: ${msg}`)
        await this.client.sendMessage(this.chatId, `❌ 处理出错: ${msg}`)
        if (this.notificationEnabled) {
          sendNotification('播客笔记助手', `处理出错：${msg}`)
        }
      }
    } finally {
      this.processing = false
      this.abortRef = null
      this.processingFunc?.(false)
    }
  }
}
