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
    // #region debug-point D:incomplete-history-check
    ;(()=>{let u='http://127.0.0.1:7777/event',s='whisper-history-bugs';try{const e=require('fs').readFileSync('.dbg/whisper-history-bugs.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'src/main/processed-message-store.ts:hasIncompleteRecentTask',msg:'[DEBUG] check incomplete recent task',data:{url,episodeId,matched,recentTasks:(state.recentTasks||[]).map(t=>({id:t.id,status:t.status,url:t.url,episodeId:t.episodeId,updatedAt:t.updatedAt}))},ts:Date.now()})}).catch(()=>{})})()
    // #endregion
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
    // #region debug-point D:flush-state
    ;(()=>{let u='http://127.0.0.1:7777/event',s='whisper-history-bugs';try{const e=require('fs').readFileSync('.dbg/whisper-history-bugs.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'D',location:'src/main/processed-message-store.ts:flush',msg:'[DEBUG] processed store flush state',data:{processedCount:processed.length,processedUrlsCount:processedUrls.length,recentTasksCount:(currentState.recentTasks||[]).length,recentTasks:(currentState.recentTasks||[]).map(t=>({id:t.id,status:t.status,url:t.url,episodeId:t.episodeId,updatedAt:t.updatedAt}))},ts:Date.now()})}).catch(()=>{})})()
    // #endregion
  }
}
