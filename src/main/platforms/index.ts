/** 平台适配器统一导出 */

export type { PlatformAdapter, AudioExtractResult, PlatformInfo, ExtractType } from './types'
export { platformRegistry } from './registry'
export { XiaoyuzhouAdapter, fetchOgTitle } from './xiaoyuzhou'
export { BilibiliAdapter } from './bilibili'
export { YouTubeAdapter } from './youtube'
export { DirectUrlAdapter } from './direct-url'
export { detectYtDlp, extractAudioWithYtDlp, extractSubtitles, parseSubtitleToText } from './yt-dlp'
export type { YtDlpStatus } from './yt-dlp'
