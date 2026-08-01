/** 平台适配器统一导出 */

export type { PlatformAdapter, AudioExtractResult, PlatformInfo, ExtractType } from './types'
export { platformRegistry } from './registry'
export { XiaoyuzhouAdapter, fetchOgTitle } from './xiaoyuzhou'
export { BilibiliAdapter } from './bilibili'
export { DouyinAdapter } from './douyin'
export { YouTubeAdapter } from './youtube'
export { XimalayaAdapter } from './ximalaya'
export { ApplePodcastsAdapter } from './apple-podcasts'
export { DirectUrlAdapter } from './direct-url'
export {
  detectYtDlp,
  autoDownloadYtDlp,
  extractAudioWithYtDlp,
  extractSubtitles,
  parseSubtitleToText,
} from './yt-dlp'
export type { YtDlpStatus } from './yt-dlp'
