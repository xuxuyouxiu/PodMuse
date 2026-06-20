import { getActiveProviderConfig } from './ai-providers'
import type { PodcastConfig, FeishuStatus, StepInfo } from '@shared/types'
import { FeishuClient } from './feishu-client'
import { MessageParser } from './message-parser'
import { ProcessedMessageStore } from './processed-message-store'
import { PodcastDispatchService } from './podcast-dispatcher'
import { MessagePoller } from './message-poller'

export class FeishuMonitor {
  private client: FeishuClient
  private store: ProcessedMessageStore
  private poller: MessagePoller
  private chatId: string
  private logFunc: (msg: string) => void
  private statusFunc: (status: FeishuStatus) => void
  private dispatcher: PodcastDispatchService

  constructor(
    config: PodcastConfig,
    logFunc: (msg: string) => void,
    statusFunc: (status: FeishuStatus) => void,
    stepFunc?: (step: StepInfo) => void,
    processingFunc?: (processing: boolean, url?: string) => void,
    stateChangedFunc?: () => void,
  ) {
    this.logFunc = logFunc
    this.statusFunc = statusFunc

    this.chatId = config.feishu_chat_id || ''

    this.client = new FeishuClient(config.feishu_app_id, config.feishu_app_secret, logFunc)
    this.store = new ProcessedMessageStore()

    // 获取活跃 AI 供应商配置，回退到旧 api_key 字段
    let providerConfig = getActiveProviderConfig(config.ai_provider, config.ai_providers)
    if (!providerConfig && config.api_key) {
      providerConfig = { baseUrl: 'https://api.deepseek.com', apiKey: config.api_key, model: 'deepseek-chat' }
    }

    const parser = new MessageParser()
    this.dispatcher = new PodcastDispatchService(
      this.client, this.store, this.chatId,
      providerConfig, config.ai_provider,
      config.language,
      config.obsidian_dir || '', config.audio_dir || '',
      logFunc, stepFunc, processingFunc, stateChangedFunc,
      config.notification_enabled !== false,
    )

    this.poller = new MessagePoller(
      this.client, parser, this.store, this.dispatcher,
      this.chatId, logFunc,
      () => this.emitStatus(),
    )
  }

  private emitStatus(): void {
    this.statusFunc(this.getStatus())
  }

  async start(): Promise<void> {
    await this.poller.start()
    this.emitStatus()
  }

  stop(): void {
    this.poller.stop()
  }

  cancelProcessing(): boolean {
    if (this.dispatcher?.abortRef) {
      this.dispatcher.abortRef.abort()
      return true
    }
    return false
  }

  setBatchMode(v: boolean): void {
    if (this.dispatcher) this.dispatcher.batchMode = v
  }

  hasActiveProcess(): boolean {
    return !!(this.dispatcher?.abortRef && !this.dispatcher.abortRef.signal.aborted)
  }

  isConnected(): boolean {
    return this.client.isConnected()
  }

  getStatus(): FeishuStatus {
    return {
      connected: this.client.isConnected(),
      monitoring: this.poller.isRunning,
      chatId: this.chatId,
    }
  }
}
