import { FeishuStatus } from '@shared/types'
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

  constructor(
    config: any,
    logFunc: (msg: string) => void,
    statusFunc: (status: FeishuStatus) => void,
    stepFunc?: (step: any) => void,
    processingFunc?: (processing: boolean, url?: string) => void,
    stateChangedFunc?: () => void,
  ) {
    this.logFunc = logFunc
    this.statusFunc = statusFunc

    this.chatId = config.feishu_chat_id || ''

    this.client = new FeishuClient(config.feishu_app_id, config.feishu_app_secret, logFunc)
    this.store = new ProcessedMessageStore()

    const parser = new MessageParser()
    const dispatcher = new PodcastDispatchService(
      this.client, this.store, this.chatId,
      config.api_key, config.language,
      config.obsidian_dir || '', config.audio_dir || '',
      logFunc, stepFunc, processingFunc, stateChangedFunc,
    );
    (this as any)._dispatcher = dispatcher

    this.poller = new MessagePoller(
      this.client, parser, this.store, dispatcher,
      this.chatId, logFunc,
      () => this.emitStatus(),
    )
  }

  private emitStatus(): void {
    this.statusFunc(this.getStatus())
  }

  async start(): Promise<void> {
    await this.poller.start()
  }

  stop(): void {
    this.poller.stop()
  }

  cancelProcessing(): boolean {
    const dispatcher = (this as any)._dispatcher as PodcastDispatchService | undefined
    if (dispatcher?.abortRef) {
      dispatcher.abortRef.abort()
      return true
    }
    return false
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
