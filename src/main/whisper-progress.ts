import { spawnSync } from 'child_process'
import * as fs from 'fs'

export type WhisperProgressPhase = 'preparing' | 'transcribing' | 'finalizing'

export interface WhisperProgressDisplay {
  progress?: number
  phase: WhisperProgressPhase
  subtitle: string
  detail: string
}

export interface AudioDurationResult {
  duration: number
  method: 'ffprobe' | 'filesize' | 'fallback'
}

export function getAudioDurationSec(audioPath: string): AudioDurationResult {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      audioPath,
    ], { timeout: 8000 })
    if (result.status === 0) {
      const raw = result.stdout.toString().trim()
      if (raw) {
        const duration = parseFloat(raw)
        if (Number.isFinite(duration) && duration > 1) {
          return { duration, method: 'ffprobe' }
        }
      }
    }
    const stderrRaw = result.stderr?.toString() || ''
    if (stderrRaw) {
      const match = stderrRaw.match(/Duration:\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)/)
      if (match) {
        const duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
        if (Number.isFinite(duration) && duration > 1) {
          return { duration, method: 'ffprobe' }
        }
      }
    }
  } catch {}

  try {
    const stat = fs.statSync(audioPath)
    const sizeKB = stat.size / 1024
    let bitrate = 32
    const ext = audioPath.split('.').pop()?.toLowerCase()
    if (ext === 'mp3') bitrate = 128
    else if (ext === 'm4a' || ext === 'aac') bitrate = 96
    else if (ext === 'ogg') bitrate = 96
    else if (ext === 'wav') bitrate = 1411
    const duration = (sizeKB * 8) / bitrate
    if (Number.isFinite(duration) && duration > 10) {
      return { duration, method: 'filesize' }
    }
  } catch {}

  return { duration: 3600, method: 'fallback' }
}

export function extractTimestampEndSec(line: string): number | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const hmsPatterns = [
    /\[(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)\s*-->\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)\]/,
    /(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)\s*-->\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)/,
    /\[(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)\s*[→-]\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)\]/,
  ]

  for (const pattern of hmsPatterns) {
    const match = trimmed.match(pattern)
    if (match) {
      const endH = parseInt(match[4], 10)
      const endM = parseInt(match[5], 10)
      const endS = parseFloat(match[6])
      if (Number.isFinite(endH) && Number.isFinite(endM) && Number.isFinite(endS)) {
        return endH * 3600 + endM * 60 + endS
      }
    }
  }

  const msPatterns = [
    /\[(\d{2}):(\d{2}(?:\.\d+)?)\s*-->\s*(\d{2}):(\d{2}(?:\.\d+)?)\]/,
    /(\d{2}):(\d{2}(?:\.\d+)?)\s*-->\s*(\d{2}):(\d{2}(?:\.\d+)?)/,
    /\[(\d{2}):(\d{2}(?:\.\d+)?)\s*[→-]\s*(\d{2}):(\d{2}(?:\.\d+)?)\]/,
  ]

  for (const pattern of msPatterns) {
    const match = trimmed.match(pattern)
    if (match) {
      const endM = parseInt(match[3], 10)
      const endS = parseFloat(match[4])
      if (Number.isFinite(endM) && Number.isFinite(endS)) {
        return endM * 60 + endS
      }
    }
  }

  const loneTsPattern = /(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)/
  const loneMatch = trimmed.match(loneTsPattern)
  if (loneMatch && /timestep|progress|processing|segment/i.test(trimmed)) {
    const h = parseInt(loneMatch[1], 10)
    const m = parseInt(loneMatch[2], 10)
    const s = parseFloat(loneMatch[3])
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return h * 3600 + m * 60 + s
    }
  }

  return null
}

export function parseWhisperPercent(line: string): number | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const patterns = [
    /(\d{1,3})\s*%/g,
    /(\d{1,3})%/g,
  ]

  for (const pattern of patterns) {
    const matches = [...trimmed.matchAll(pattern)]
    if (matches.length > 0) {
      const value = parseInt(matches[matches.length - 1][1], 10)
      if (value >= 0 && value <= 100 && Number.isFinite(value)) {
        return value
      }
    }
  }

  return null
}

export function formatWhisperProgress(
  phase: WhisperProgressPhase,
  progress: number,
): WhisperProgressDisplay {
  const pct = Math.max(0, Math.min(100, Math.round(progress)))

  switch (phase) {
    case 'preparing':
      return {
        progress: undefined,
        phase: 'preparing',
        subtitle: 'Whisper 准备中',
        detail: '正在加载模型',
      }
    case 'transcribing':
      return {
        progress: pct,
        phase: 'transcribing',
        subtitle: `Whisper 转写中 ${pct}%`,
        detail: pct > 0 ? `已完成 ${pct}%` : '正在初始化转写',
      }
    case 'finalizing':
      return {
        progress: 100,
        phase: 'finalizing',
        subtitle: `转写完成`,
        detail: '正在整理结果',
      }
  }
}
