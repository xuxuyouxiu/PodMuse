import type { PodcastConfig } from '@shared/types'
import { AliyunTranscriber } from './aliyun'
import { XfyunTranscriber } from './xfyun'
import { LocalWhisperTranscriber } from './local-whisper'
import { isAbortError, type TranscribeEngine, type TranscribeHooks } from './types'
import { BrowserWindow } from 'electron'

export * from './types'

const engines: Record<string, TranscribeEngine> = {
  'local-whisper': new LocalWhisperTranscriber(),
  aliyun: new AliyunTranscriber(),
  xfyun: new XfyunTranscriber(),
}

/** 配置里的引擎选择 → 引擎实例；未知值回落本地 */
function pickEngine(cfg: PodcastConfig): TranscribeEngine {
  const choice = cfg.transcribe_engine || 'local'
  if (choice === 'aliyun') return engines['aliyun']
  if (choice === 'xfyun') return engines['xfyun']
  return engines['local-whisper']
}

/**
 * 语音转文字统一入口（podcast.ts 唯一调用点）。
 *
 * 编排规则：
 * - 选择本地引擎：行为与旧版 runWhisper 完全一致
 * - 选择云端引擎但凭据未配置：直接走本地，日志/toast 提示原因
 * - 选择云端引擎且已配置：先云端；失败（非用户取消）自动降级本地重试，
 *   本地也失败时返回 null 并把两条错误都写进日志
 *
 * 成功返回转写文本；整体失败返回 null（与旧 runWhisper 契约一致）。
 */
export async function transcribeAudio(
  cfg: PodcastConfig,
  audioPath: string,
  language: 'zh' | 'en' | 'auto',
  hooks: TranscribeHooks,
  signal?: AbortSignal,
): Promise<string | null> {
  const sig = signal ?? new AbortController().signal
  const chosen = pickEngine(cfg)

  // 本地引擎：直接执行，保持旧行为
  if (chosen.id === 'local-whisper') {
    return engines['local-whisper']
      .transcribe(cfg, audioPath, language, hooks, sig)
      .catch(() => null)
  }

  const engineName = chosen.id === 'aliyun' ? '阿里云百炼' : '讯飞'
  if (!chosen.isConfigured(cfg)) {
    hooks.log(`  ⚠ ${engineName}凭据未配置，自动使用本地 Whisper 引擎`)
    notifyRenderer(`云端转写引擎（${engineName}）未配置，本次已用本地引擎`, 'error')
    return engines['local-whisper']
      .transcribe(cfg, audioPath, language, hooks, sig)
      .catch(() => null)
  }

  try {
    hooks.log(`  ☁ 使用云端转写引擎：${engineName}`)
    const text = await chosen.transcribe(cfg, audioPath, language, hooks, sig)
    hooks.log(`  ✓ 云端转写完成`)
    return text
  } catch (e) {
    if (isAbortError(e)) throw e
    const reason = e instanceof Error ? e.message : String(e)
    hooks.log(`  ⚠ ${engineName}云端转写失败：${reason}`)
    hooks.log(`  🔄 自动降级为本地 Whisper 引擎重试…`)
    notifyRenderer(`${engineName}转写失败（${reason}），已降级本地引擎`, 'error')
    return engines['local-whisper']
      .transcribe(cfg, audioPath, language, hooks, sig)
      .catch(() => null)
  }
}

/** 渲染层 toast 通知（窗口不可用时静默跳过，不阻塞转写流程） */
function notifyRenderer(message: string, type: 'success' | 'error'): void {
  try {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('toast', { message, type })
  } catch {}
}
