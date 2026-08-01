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
    const allTasks = [...(state.activeTasks || []), ...(state.recentTasks || [])]
    const matched = allTasks.some(
      task =>
        task.status !== 'completed' &&
        ((episodeId && task.episodeId === episodeId) || task.url === url),
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

  /** Sync an episodeId into in-memory urlIds set (e.g. from task deletion) */
  addUrlId(episodeId: string): void {
    this.urlIds.add(episodeId)
    this.dirty = true
  }

  flush(): void {
    if (!this.dirty) return
    this.dirty = false

    const currentState = loadState()

    // Merge in-memory sets with disk data (union) to avoid losing entries
    // added by other operations between flush cycles
    const diskProcessed = new Set(currentState.processed || [])
    const mergedProcessed = new Set([...diskProcessed, ...this.messageIds])
    const diskProcessedUrls = new Set(currentState.processedUrls || [])
    const mergedProcessedUrls = new Set([...diskProcessedUrls, ...this.urlIds])

    // Also sync disk entries back into memory so future flushes are accurate
    for (const id of diskProcessed) this.messageIds.add(id)
    for (const id of diskProcessedUrls) this.urlIds.add(id)

    let processed = Array.from(mergedProcessed)
    let processedUrls = Array.from(mergedProcessedUrls)

    if (processed.length > MAX_MESSAGE_IDS) {
      processed = processed.slice(-MAX_MESSAGE_IDS)
    }
    if (processedUrls.length > MAX_URL_IDS) {
      processedUrls = processedUrls.slice(-MAX_URL_IDS)
    }

    // 同步截断内存 Set，防止无限增长
    this.messageIds = new Set(processed)
    this.urlIds = new Set(processedUrls)

    saveState({
      ...currentState,
      processed,
      processedUrls,
    })
  }
}
