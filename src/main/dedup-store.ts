import { loadState, saveState } from './config'

const MAX_IDS = 10000

/** In-memory dedup set for manual processing pre-checks, capped at MAX_IDS */
const state = loadState()
export const processedEpisodeIds = new Set<string>(state.processedUrls || [])

/** 添加 ID 并持久化，超过上限时淘汰最早的一半 */
export function addProcessedId(id: string): void {
  processedEpisodeIds.add(id)
  if (processedEpisodeIds.size > MAX_IDS) {
    // Set 保持插入顺序，淘汰前半部分（最旧的）
    const toDelete = Math.floor(MAX_IDS / 2)
    let deleted = 0
    for (const key of processedEpisodeIds) {
      if (deleted >= toDelete) break
      processedEpisodeIds.delete(key)
      deleted++
    }
  }
  // 持久化到 state
  const current = loadState()
  current.processedUrls = [...processedEpisodeIds]
  saveState(current)
}
