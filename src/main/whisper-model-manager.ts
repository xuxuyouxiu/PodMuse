import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface WhisperModelInfo {
  id: string
  label: string
  size: string
  downloaded: boolean
  ramMinGB: number
}

const STANDARD_MODELS: Omit<WhisperModelInfo, 'downloaded'>[] = [
  { id: 'tiny', label: 'Tiny', size: '~1 GB', ramMinGB: 1 },
  { id: 'base', label: 'Base', size: '~1 GB', ramMinGB: 1 },
  { id: 'small', label: 'Small', size: '~2 GB', ramMinGB: 2 },
  { id: 'medium', label: 'Medium', size: '~5 GB', ramMinGB: 4 },
  { id: 'large-v3', label: 'Large v3', size: '~10 GB', ramMinGB: 8 },
  { id: 'large-v3-turbo', label: 'Large v3 Turbo', size: '~6 GB', ramMinGB: 6 },
]

export function getStandardModels(): Omit<WhisperModelInfo, 'downloaded'>[] {
  return STANDARD_MODELS
}

function getCacheDirs(): string[] {
  const home = os.homedir()
  const dirs: string[] = []
  const candidates = [
    path.join(home, '.cache', 'whisper'),
    path.join(home, '.cache', 'faster-whisper-xxl'),
    path.join(home, '.cache', 'faster-whisper'),
    path.join(process.env.XDG_CACHE_HOME || '', 'whisper'),
    path.join(os.tmpdir(), 'whisper-models'),
  ]
  for (const d of candidates) {
    if (d && fs.existsSync(d)) dirs.push(d)
  }
  return dirs
}

export function scanLocalModels(): WhisperModelInfo[] {
  const cacheDirs = getCacheDirs()
  const downloadedIds = new Set<string>()

  for (const cacheDir of cacheDirs) {
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          downloadedIds.add(entry.name.toLowerCase())
        }
      }
    } catch {}
  }

  return STANDARD_MODELS.map(m => ({
    ...m,
    downloaded: downloadedIds.has(m.id) || downloadedIds.has(m.id.replace(/-/g, '')),
  }))
}

export interface HardwareCheckResult {
  pass: boolean
  totalRamGB: number
  requiredGB: number
  warning: string | null
}

export function checkHardware(modelId: string): HardwareCheckResult {
  const model = STANDARD_MODELS.find(m => m.id === modelId)
  const requiredGB = model?.ramMinGB || 4
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024))

  if (totalRamGB < requiredGB) {
    return {
      pass: false,
      totalRamGB,
      requiredGB,
      warning: `当前系统内存 ${totalRamGB} GB，建议 ${requiredGB} GB 以上运行 ${modelId} 模型，可能出现卡顿或内存不足。`,
    }
  }

  if (totalRamGB < requiredGB + 2) {
    return {
      pass: true,
      totalRamGB,
      requiredGB,
      warning: `内存 ${totalRamGB} GB 勉强满足 ${modelId} 模型要求（建议 ${requiredGB + 2} GB 以上以获得流畅体验）。`,
    }
  }

  return { pass: true, totalRamGB, requiredGB, warning: null }
}
