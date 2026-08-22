import { runWhisper } from '../whisper'
import { abortError, type TranscribeEngine } from './types'

/**
 * 本地 Whisper 引擎包装：
 * runWhisper 失败/取消都返回 null，这里转成契约要求的 Error / AbortError。
 * 引擎可用性（exe/模型）由 runWhisper 内部自动检测处理，isConfigured 恒 true——
 * 真正不可用时 transcribe 会抛错，上层按失败处理而不是静默跳过。
 */
export class LocalWhisperTranscriber implements TranscribeEngine {
  id = 'local-whisper' as const

  isConfigured(): boolean {
    return true
  }

  async transcribe(
    _cfg: unknown,
    audioPath: string,
    language: 'zh' | 'en' | 'auto',
    hooks: {
      log(msg: string): void
      status(subtitle: string, detail: string, progress?: number): void
    },
    signal: AbortSignal,
  ): Promise<string> {
    const text = await runWhisper(
      audioPath,
      language,
      hooks.log,
      status => {
        hooks.status(status.subtitle, status.detail, status.progress)
      },
      signal,
    )
    if (text == null) {
      if (signal.aborted) throw abortError()
      throw new Error('本地 Whisper 转写失败（详见处理日志）')
    }
    return text
  }
}
