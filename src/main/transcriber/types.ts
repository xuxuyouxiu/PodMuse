import type { PodcastConfig } from '@shared/types'

/** 转写引擎 ID：local-whisper 本地引擎；aliyun 阿里云百炼；xfyun 讯飞 */
export type TranscribeEngineId = 'local-whisper' | 'aliyun' | 'xfyun'

/** 配置里的引擎选择（持久化值，映射到 TranscribeEngineId） */
export type TranscribeEngineChoice = 'local' | 'aliyun' | 'xfyun'

/** 转写语言（与 PodcastConfig.language 一致） */
export type TranscribeLanguage = 'zh' | 'en' | 'auto'

/** 进度/日志回调：podcast.ts 的 step 面板经此透传 */
export interface TranscribeHooks {
  log(msg: string): void
  status(subtitle: string, detail: string, progress?: number): void
}

/**
 * 转写引擎统一契约：
 * - transcribe 成功返回纯文本；失败抛 Error（message 为可读中文原因）
 * - 用户主动取消抛 name='AbortError'
 * - cfg 由调用方传入（与 isConfigured 同一快照，避免中途改配置导致状态不一致）
 */
export interface TranscribeEngine {
  id: TranscribeEngineId
  /** 凭据是否齐备（决定能否真正调用，不齐时上层降级本地） */
  isConfigured(cfg: PodcastConfig): boolean
  transcribe(
    cfg: PodcastConfig,
    audioPath: string,
    language: TranscribeLanguage,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string>
}

/** 抛出标准化取消错误 */
export function abortError(): Error {
  return Object.assign(new Error('已取消'), { name: 'AbortError' })
}

/** 判断错误是否为用户主动取消 */
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}
