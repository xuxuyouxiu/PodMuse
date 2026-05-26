import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import {
  formatWhisperProgress,
  parseWhisperPercent,
  isWhisperTranscriptActivity,
  WhisperProgressDisplay,
  WhisperProgressPhase,
} from './whisper-progress'

const WHISPER_EXE = 'D:\\Tools\\Faster-Whisper-XXL\\faster-whisper-xxl.exe'
const WHISPER_MODEL = 'large-v3-turbo'

export function runWhisper(
  audioPath: string,
  language: string = 'zh',
  logFunc?: (msg: string) => void,
  progressFunc?: (status: WhisperProgressDisplay) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const log = (m: string) => { logFunc?.(m); console.log(m) }

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
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
      '--model', WHISPER_MODEL,
      '--output_format', 'txt',
      '--output_dir', dir,
    ]

    if (language !== 'auto') {
      args.splice(1, 0, '--language', language)
    }

    log(`执行: ${path.basename(WHISPER_EXE)} ${args.join(' ')}`)

    const proc = spawn(WHISPER_EXE, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const onAbort = () => {
      proc.kill()
      finish(null)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    let stderrText = ''
    let lastPct = -1
    let lastProgress: number | undefined
    let phase: WhisperProgressPhase = 'preparing'
    let hasRealProgress = false
    let hasTranscriptActivity = false

    const emitStatus = (mode: 'real' | 'estimated', progress?: number, nextPhase: WhisperProgressPhase = phase) => {
      if (settled || signal?.aborted) return
      phase = nextPhase
      if (progress != null) {
        lastProgress = Math.max(lastProgress ?? 0, progress)
      }
      // #region debug-point B:whisper-emit-status
      ;(()=>{let u='http://127.0.0.1:7777/event',s='whisper-history-bugs';try{const e=fs.readFileSync('.dbg/whisper-history-bugs.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'src/main/whisper.ts:emitStatus',msg:'[DEBUG] whisper emitStatus',data:{mode,phase,nextPhase,progress,lastProgress,hasRealProgress,settled},ts:Date.now()})}).catch(()=>{})})()
      // #endregion
      progressFunc?.(formatWhisperProgress({ mode, phase, progress: lastProgress }))
    }

    function emitProgress(line: string) {
      if (settled || signal?.aborted) return
      const trimmed = line.trim()
      if (!trimmed) return
      const pct = parseWhisperPercent(trimmed)
      // #region debug-point A:whisper-raw-line
      ;(()=>{let u='http://127.0.0.1:7777/event',s='whisper-history-bugs';try{const e=fs.readFileSync('.dbg/whisper-history-bugs.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'src/main/whisper.ts:emitProgress',msg:'[DEBUG] whisper raw output line',data:{trimmed:trimmed.slice(0,200),pct,lastPct,hasRealProgress},ts:Date.now()})}).catch(()=>{})})()
      // #endregion
      if (pct != null && pct > lastPct) {
        lastPct = pct
        hasRealProgress = true
        emitStatus('real', pct, 'transcribing')
        return
      }
      if (!hasTranscriptActivity && isWhisperTranscriptActivity(trimmed)) {
        hasTranscriptActivity = true
        emitStatus('real', undefined, 'transcribing')
      }
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    const finishWith = (value: string | null) => {
      cleanup()
      finish(value)
    }

    proc.on('spawn', () => {
      if (!settled && !signal?.aborted) {
        emitStatus('estimated', undefined, 'preparing')
      }
    })

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      text.split(/[\r\n]+/).forEach(emitProgress)
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrText += text
      text.split(/[\r\n]+/).forEach(emitProgress)
    })

    proc.on('close', (code) => {
      if (settled || signal?.aborted) {
        finishWith(null)
        return
      }
      if (hasRealProgress) {
        emitStatus('real', Math.max(lastProgress ?? 0, 100), 'finalizing')
      } else if (hasTranscriptActivity) {
        emitStatus('real', undefined, 'finalizing')
      } else {
        emitStatus('estimated', undefined, 'finalizing')
      }
      let allFiles: string[] = []
      try { allFiles = fs.readdirSync(dir) } catch {}

      const txtFiles = allFiles
        .filter(f => f.endsWith('.txt'))
        .map(f => path.join(dir, f))
        .sort((a, b) => {
          try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs } catch { return 0 }
        })

      for (const f of txtFiles) {
        try {
          const content = fs.readFileSync(f, 'utf-8')
          if (content.length > 100) {
            emitStatus('real', 100, 'finalizing')
            finishWith(content)
            return
          }
        } catch {}
      }

      if (code !== 0) {
        log(`❌ Whisper 退出码 ${code}: ${stderrText.trim().substring(0, 400)}`)
      } else {
        log(`⚠ Whisper exit 0 but no valid txt found in ${dir}. Files: ${allFiles.filter(f => f.endsWith('.txt')).join(', ') || '(none)'}`)
        if (stderrText.trim()) log(`  stderr: ${stderrText.trim().substring(0, 300)}`)
      }
      finishWith(null)
    })

    proc.on('error', (err) => {
      if (settled) return
      log(`❌ Whisper 启动失败: ${err.message}`)
      finishWith(null)
    })
  })
}
