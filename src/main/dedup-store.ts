import { loadState } from './config'

/** In-memory dedup set for manual processing pre-checks */
export const processedEpisodeIds = new Set<string>(loadState().processedUrls || [])
