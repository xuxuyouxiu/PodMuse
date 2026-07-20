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

/** 自动检测 Faster-Whisper-XXL 可执行文件路径 */
function autoDetectExePath(): string | undefined {
  const exeName = 'faster-whisper-xxl.exe'
  const candidates: string[] = []

  // 常见安装路径
  const drives = ['C:', 'D:', 'E:', 'F:']
  const commonDirs = [
    'Faster-Whisper-XXL',
    'faster-whisper-xxl',
    path.join('Potplayer', 'Engine', 'Faster-Whisper-XXL'),
    path.join('Program Files', 'Faster-Whisper-XXL'),
    path.join('Program Files (x86)', 'Faster-Whisper-XXL'),
    path.join(os.homedir(), 'Downloads', 'Faster-Whisper-XXL'),
    path.join(os.homedir(), 'Desktop', 'Faster-Whisper-XXL'),
  ]
  for (const drive of drives) {
    for (const dir of commonDirs) {
      candidates.push(path.join(drive + '\\', dir, exeName))
    }
  }

  // PATH 环境变量
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, exeName))
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return undefined
}

function getCacheDirs(whisperExePath?: string): string[] {
  const home = os.homedir()
  const dirs: string[] = []
  const candidates = [
    path.join(home, '.cache', 'whisper'),
    path.join(home, '.cache', 'faster-whisper-xxl'),
    path.join(home, '.cache', 'faster-whisper'),
    path.join(process.env.XDG_CACHE_HOME || '', 'whisper'),
    path.join(os.tmpdir(), 'whisper-models'),
    // Hugging Face 缓存（Faster-Whisper-XXL 默认下载位置）
    path.join(home, '.cache', 'huggingface', 'hub'),
  ]
  for (const d of candidates) {
    if (d && fs.existsSync(d)) dirs.push(d)
  }

  // 自动检测 exe 路径（如果用户未配置）
  if (!whisperExePath) {
    whisperExePath = autoDetectExePath()
  }

  if (whisperExePath) {
    const exeDir = path.dirname(whisperExePath)
    // Faster-Whisper-XXL 常见模型目录
    for (const sub of ['_models', 'models', '']) {
      const modelsDir = sub ? path.join(exeDir, sub) : exeDir
      if (modelsDir && fs.existsSync(modelsDir)) dirs.push(modelsDir)
    }
  }

  return dirs
}

export function scanLocalModels(whisperExePath?: string): WhisperModelInfo[] {
  const cacheDirs = getCacheDirs(whisperExePath)
  const downloadedIds = new Set<string>()

  for (const cacheDir of cacheDirs) {
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const name = entry.name.toLowerCase()
          downloadedIds.add(name)
          // 去掉常见前缀
          const stripped = name.replace(/^(faster-whisper-|faster-|whisper-)/, '')
          if (stripped !== name) downloadedIds.add(stripped)
          // Hugging Face 缓存格式: models--Systran--faster-whisper-large-v3
          const hfMatch = name.match(/^models--[^-]+--faster-whisper-(.+)$/)
          if (hfMatch) downloadedIds.add(hfMatch[1])
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
