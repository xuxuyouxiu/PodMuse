/** 平台适配器公共类型 */

export type ExtractType = 'direct_url' | 'yt_dlp' | 'pre_transcribed'

export interface AudioExtractResult {
  /** 提取类型：直接 URL / yt-dlp / 已有转写文本 */
  type: ExtractType
  /** direct_url: 音频直链; yt_dlp: 视频页面 URL */
  audioUrl?: string
  /** 内容标题 */
  title?: string
  /** 元数据（作者、发布日期、描述等） */
  metadata?: Record<string, string>
  /** yt_dlp 模式下的视频 ID（用于去重） */
  videoId?: string
  /** pre_transcribed 模式下的已有转写文本 */
  transcript?: string
  /** pre_transcribed 模式下的字幕语言 */
  subtitleLang?: string
  /** direct_url 模式下的自定义请求头（如 B 站需要 Referer） */
  headers?: Record<string, string>
}

export interface PlatformAdapter {
  /** 平台唯一标识 */
  id: string
  /** 平台显示名称 */
  name: string
  /** URL 匹配正则 */
  urlPattern: RegExp
  /** 是否匹配该 URL */
  match(url: string): boolean
  /** 提取音频（或字幕） */
  extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult>
  /** 从 URL 提取去重 key */
  getDedupKey(url: string): string | null
  /** 快速获取标题（用于入队预取，避免处理前显示 URL）；未实现时回退 og:title */
  fetchTitle?(url: string, signal?: AbortSignal): Promise<string | null>
}

/** 已识别的平台信息 */
export interface PlatformInfo {
  id: string
  name: string
  url: string
  adapter: PlatformAdapter
}
