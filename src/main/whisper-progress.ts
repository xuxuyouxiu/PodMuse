export type WhisperProgressMode = 'real' | 'estimated'
export type WhisperProgressPhase = 'preparing' | 'transcribing' | 'finalizing'

export interface WhisperProgressDisplay {
  progress?: number
  mode: WhisperProgressMode
  phase: WhisperProgressPhase
  subtitle: string
  detail: string
}

export function parseWhisperPercent(line: string): number | null {
  const matches = [...line.matchAll(/(\d{1,3})%/g)]
  if (!matches.length) return null
  const value = parseInt(matches[matches.length - 1][1], 10)
  if (value < 0 || value > 100) return null
  return value
}

export function isWhisperTranscriptActivity(line: string): boolean {
  return /^\[\d{1,2}:\d{2}(?:\.\d+)?\s+-->\s+\d{1,2}:\d{2}(?:\.\d+)?\]/.test(line.trim())
}

export function estimateWhisperProgress(input: {
  phase: WhisperProgressPhase
  elapsedMs: number
  fileSizeBytes: number
  lastProgress?: number
}): number {
  const lastProgress = input.lastProgress ?? 0
  const fileSizeMb = Math.max(1, input.fileSizeBytes / (1024 * 1024))

  if (input.phase === 'preparing') {
    return clamp(Math.max(lastProgress, 3 + Math.floor(input.elapsedMs / 500)), 3, 12)
  }

  if (input.phase === 'transcribing') {
    const estimatedTotalMs = clamp(fileSizeMb * 4000, 20000, 20 * 60 * 1000)
    const raw = 12 + Math.floor((input.elapsedMs / estimatedTotalMs) * 80)
    return clamp(Math.max(lastProgress, raw), 12, 92)
  }

  return clamp(Math.max(lastProgress, 93 + Math.floor(input.elapsedMs / 700)), 93, 99)
}

export function formatWhisperProgress(input: {
  mode: WhisperProgressMode
  phase: WhisperProgressPhase
  progress?: number
}): WhisperProgressDisplay {
  if (input.phase === 'preparing') {
    return {
      progress: input.progress,
      mode: input.mode,
      phase: input.phase,
      subtitle: 'Whisper 准备中',
      detail: '正在加载模型',
    }
  }

  if (input.phase === 'transcribing') {
    return {
      progress: input.progress,
      mode: input.mode,
      phase: input.phase,
      subtitle: 'Whisper 转写中',
      detail: input.mode === 'estimated' ? '正在转写音频' : '正在实时转写音频',
    }
  }

  return {
    progress: input.progress,
    mode: input.mode,
    phase: input.phase,
    subtitle: 'Whisper 收尾中',
    detail: '正在整理转写结果',
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}
