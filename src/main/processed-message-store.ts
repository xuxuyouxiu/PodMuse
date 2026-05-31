import { loadState, saveState } from './config'

const MAX_MESSAGE_IDS = 500
const MAX_URL_IDS = 200

export class ProcessedMessageStore {
  private messageIds: Set<string>
  private urlIds: Set<string>
  private dirty = false

  constructor() {
    const state = loadState()
    this.messageIds = new Set(state.processed || [])
    this.urlIds = new Set(state.processedUrls || [])
  }

  has(msgId: string): boolean {
    return this.messageIds.has(msgId)
  }

  hasUrl(episodeId: string): boolean {
    return this.urlIds.has(episodeId)
  }

  hasIncompleteRecentTask(url: string, episodeId: string | null): boolean {
    const state = loadState()
    const matched = (state.recentTasks || []).some(task =>
      task.status !== 'completed'
      && ((episodeId && task.episodeId === episodeId) || task.url === url),
    )
    return matched
  }

  mark(msgId: string): void {
    this.messageIds.add(msgId)
    this.dirty = true
  }

  markUrl(episodeId: string): void {
    this.urlIds.add(episodeId)
    this.dirty = true
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false

    const currentState = loadState()

    let processed = Array.from(this.messageIds)
    let processedUrls = Array.from(this.urlIds)

    if (processed.length > MAX_MESSAGE_IDS) {
      processed = processed.slice(-MAX_MESSAGE_IDS)
    }
    if (processedUrls.length > MAX_URL_IDS) {
      processedUrls = processedUrls.slice(-MAX_URL_IDS)
    }

    saveState({
      ...currentState,
      processed,
      processedUrls,
    })
  }
}
