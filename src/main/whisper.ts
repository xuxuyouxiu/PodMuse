import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { loadConfig, saveConfig } from './config'
import { autoDetectExePath } from './whisper-model-manager'
import {
  formatWhisperProgress,
  parseWhisperPercent,
  extractTimestampEndSec,
  getAudioDurationSec,
  type WhisperProgressDisplay,
  type WhisperProgressPhase,
} from './whisper-progress'

const PROGRESS_THROTTLE_MS = 200
const TICK_INTERVAL_MS = 600

export function runWhisper(
  audioPath: string,
  language: string = 'zh',
  logFunc?: (msg: string) => void,
  progressFunc?: (status: WhisperProgressDisplay) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const log = (m: string) => {
    logFunc?.(m)
    console.log(m)
  }
  const cfg = loadConfig()
  let WHISPER_EXE = cfg.whisper_exe_path
  const WHISPER_MODEL = cfg.whisper_model

  // exe 路径未配置或不存在时，自动搜索并写回配置（用户无需手动找路径）
  if (!WHISPER_EXE || !fs.existsSync(WHISPER_EXE)) {
    try {
      const detected = autoDetectExePath()
      if (detected) {
        WHISPER_EXE = detected
        // 写回配置，让设置页也能显示
        try {
          saveConfig({ ...cfg, whisper_exe_path: detected })
          log(`🔍 已自动检测到 Whisper 引擎: ${detected}`)
        } catch {}
      }
    } catch {}
  }

  return new Promise(resolve => {
    let settled = false
    let _onAbort: (() => void) | null = null
    let tickHandle: ReturnType<typeof setInterval> | null = null

    const clearTick = () => {
      if (tickHandle) {
        clearInterval(tickHandle)
        tickHandle = null
      }
    }

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      if (_onAbort) signal?.removeEventListener('abort', _onAbort)
      clearTick()
      resolve(value)
    }

    if (signal?.aborted) {
      finish(null)
      return
    }
    if (!fs.existsSync(WHISPER_EXE)) {
      log(`❌ Whisper 可执行文件不存在: ${WHISPER_EXE}`)
      finish(null)
      return
    }

    const dir = path.dirname(audioPath)
    const args = [
      '--ff_speechnorm',
      audioPath,
      '--model',
      WHISPER_MODEL,
      '--output_format',
      'txt',
      '--output_dir',
      dir,
    ]

    if (language !== 'auto') {
      args.splice(1, 0, '--language', language)
    }

    log(`执行: ${path.basename(WHISPER_EXE)} ${args.join(' ')}`)

    const durationResult = getAudioDurationSec(audioPath)
    const totalDurationSec = durationResult.duration
    log(`  ✓ 音频时长约 ${totalDurationSec.toFixed(0)} 秒 (${durationResult.method})`)

    const proc = spawn(WHISPER_EXE, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    _onAbort = () => {
      // Windows 上 SIGTERM 无效，需要用 taskkill 杀掉整个进程树
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
        } else {
          proc.kill('SIGKILL')
        }
      } catch {
        proc.kill()
      }
      finish(null)
    }
    signal?.addEventListener('abort', _onAbort, { once: true })

    let stderrText = ''
    let phase: WhisperProgressPhase = 'preparing'
    let lastProgress = 0
    let lastEmitProgress = -1
    let lastEmitTime = 0
    let hasRealActivity = false
    const spawnAt = Date.now()

    const emit = () => {
      if (settled || signal?.aborted) return

      const now = Date.now()
      if (now - lastEmitTime < PROGRESS_THROTTLE_MS && lastProgress === lastEmitProgress) return

      lastEmitTime = now
      lastEmitProgress = lastProgress
      progressFunc?.(formatWhisperProgress(phase, lastProgress))
    }

    const advancePhase = (nextPhase: WhisperProgressPhase, progress?: number) => {
      if (settled || signal?.aborted) return
      if (nextPhase !== phase) {
        phase = nextPhase
        lastEmitProgress = -1
      }
      if (progress != null && progress > lastProgress) {
        lastProgress = progress
      }
      emit()
    }

    const tryParseProgress = (line: string): number | null => {
      const tsEnd = extractTimestampEndSec(line)
      if (tsEnd != null && tsEnd > 0) {
        hasRealActivity = true
        const pct = (tsEnd / totalDurationSec) * 100
        return Math.max(0, Math.min(99, Math.round(pct)))
      }

      const pct = parseWhisperPercent(line)
      if (pct != null) {
        hasRealActivity = true
        return Math.max(0, Math.min(99, pct))
      }

      const trimmed = line.trim()
      if (!trimmed) return null

      if (!hasRealActivity) {
        const hasContent = trimmed.replace(
          /^\[\d{1,3}:\d{2}:\d{2}(?:\.\d+)?\s*-->\s*\d{1,3}:\d{2}:\d{2}(?:\.\d+)?\]\s*/,
          '',
        )
        if (hasContent && hasContent !== trimmed && hasContent.length > 2) {
          hasRealActivity = true
          const elapsed = (Date.now() - spawnAt) / 1000
          const estPct = Math.min(30, Math.round((elapsed / Math.max(totalDurationSec, 60)) * 30))
          return Math.max(lastProgress, estPct)
        }
      }

      return null
    }

    proc.on('spawn', () => {
      if (settled || signal?.aborted) return
      advancePhase('preparing', 1)
    })

    tickHandle = setInterval(() => {
      if (settled || signal?.aborted) return

      const elapsed = (Date.now() - spawnAt) / 1000

      if (phase === 'preparing') {
        if (elapsed > 15) {
          advancePhase('transcribing', Math.min(5, Math.round(elapsed * 0.3)))
          return
        }
        const estPct = Math.min(5, Math.round(1 + elapsed * 0.3))
        if (estPct > lastProgress) {
          lastProgress = estPct
        }
        emit()
      } else if (phase === 'transcribing' && !hasRealActivity) {
        const estPct = Math.min(15, Math.round(5 + (elapsed - 15) * 0.2))
        if (estPct > lastProgress) {
          lastProgress = estPct
        }
        emit()
      } else if (phase === 'transcribing' && hasRealActivity) {
        const timeSinceSpawn = elapsed
        if (lastProgress < 5 && timeSinceSpawn > 60) {
          lastProgress = Math.max(lastProgress, Math.min(10, Math.round(timeSinceSpawn * 0.15)))
        }
        emit()
      }
    }, TICK_INTERVAL_MS)

    const handleData = (text: string) => {
      if (settled || signal?.aborted) return
      const lines = text.split(/[\r\n]+/)
      for (const line of lines) {
        if (settled || signal?.aborted) return
        const progress = tryParseProgress(line)
        if (progress != null && progress > lastProgress) {
          lastProgress = progress
          if (phase === 'preparing') {
            advancePhase('transcribing', progress)
          }
        }
      }
      emit()
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      handleData(chunk.toString())
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrText += text
      handleData(text)
    })

    proc.on('close', code => {
      clearTick()
      if (settled || signal?.aborted) {
        finish(null)
        return
      }

      advancePhase('finalizing', 100)

      let allFiles: string[] = []
      try {
        allFiles = fs.readdirSync(dir)
      } catch {}

      const txtFiles = allFiles
        .filter(f => f.endsWith('.txt'))
        .map(f => path.join(dir, f))
        .sort((a, b) => {
          try {
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
          } catch {
            return 0
          }
        })

      for (const f of txtFiles) {
        try {
          const content = fs.readFileSync(f, 'utf-8')
          if (content.length > 100) {
            finish(content)
            return
          }
        } catch {}
      }

      if (code !== 0) {
        log(`❌ Whisper 退出码 ${code}: ${stderrText.trim().substring(0, 400)}`)
      } else {
        log(
          `⚠ Whisper exit 0 but no valid txt found in ${dir}. Files: ${allFiles.filter(f => f.endsWith('.txt')).join(', ') || '(none)'}`,
        )
        if (stderrText.trim()) log(`  stderr: ${stderrText.trim().substring(0, 300)}`)
      }
      finish(null)
    })

    proc.on('error', err => {
      clearTick()
      if (settled) return
      log(`❌ Whisper 启动失败: ${err.message}`)
      finish(null)
    })
  })
}
