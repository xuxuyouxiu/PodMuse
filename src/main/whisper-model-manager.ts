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
  { id: 'large-v3-turbo', label: 'Large v3 Turbo', size: '~6 GB', ramMinGB: 4 },
]

export function getStandardModels(): Omit<WhisperModelInfo, 'downloaded'>[] {
  return STANDARD_MODELS
}

/** 递归搜索指定目录下（深度受限）的 whisper exe */
function searchRecursive(dir: string, depth: number, exeNames: string[]): string | undefined {
  if (depth <= 0) return undefined
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    try {
      if (entry.isFile()) {
        const name = entry.name.toLowerCase()
        if (exeNames.some(e => name === e)) {
          return path.join(dir, entry.name)
        }
      } else if (entry.isDirectory()) {
        // 跳过系统/无意义目录，避免超时
        const lower = entry.name.toLowerCase()
        if (
          lower === 'windows' ||
          lower === 'program files' ||
          lower === 'program files (x86)' ||
          lower === '$recycle.bin' ||
          lower === 'system volume information' ||
          lower === 'node_modules' ||
          lower === '.git' ||
          lower === 'appdata' ||
          lower === 'intel' ||
          lower === 'nvidia'
        ) {
          continue
        }
        const found = searchRecursive(path.join(dir, entry.name), depth - 1, exeNames)
        if (found) return found
      }
    } catch {}
  }
  return undefined
}

/** 获取所有可用盘符（含 C-Z 中存在的固定盘） */
function getAllDrives(): string[] {
  const drives: string[] = []
  for (let letter = 67; letter <= 90; letter++) {
    const d = String.fromCharCode(letter) + ':'
    try {
      if (fs.existsSync(d + '\\')) drives.push(d)
    } catch {}
  }
  return drives
}

/** 自动检测 Faster-Whisper-XXL 可执行文件路径（快速候选 + 全盘递归兜底） */
export function autoDetectExePath(): string | undefined {
  const exeNames = ['faster-whisper-xxl.exe', 'faster-whisper.exe']
  const candidates: string[] = []

  // 1. 常见安装路径（快）
  const drives = getAllDrives()
  const commonDirs = [
    'Faster-Whisper-XXL',
    'faster-whisper-xxl',
    path.join('Potplayer', 'Engine', 'Faster-Whisper-XXL'),
    path.join('Program Files', 'Faster-Whisper-XXL'),
    path.join('Program Files (x86)', 'Faster-Whisper-XXL'),
    path.join(os.homedir(), 'Downloads', 'Faster-Whisper-XXL'),
    path.join(os.homedir(), 'Downloads', 'faster-whisper-xxl'),
    path.join(os.homedir(), 'Desktop', 'Faster-Whisper-XXL'),
    path.join(os.homedir(), 'Desktop', 'faster-whisper-xxl'),
  ]
  for (const drive of drives) {
    for (const dir of commonDirs) {
      for (const exe of exeNames) {
        candidates.push(path.join(drive + '\\', dir, exe))
      }
    }
  }

  // 2. PATH 环境变量
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  for (const dir of pathDirs) {
    for (const exe of exeNames) {
      candidates.push(path.join(dir, exe))
    }
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }

  // 3. 全盘递归搜索（深度 4，跳过系统目录）——处理非标准安装位置
  for (const drive of drives) {
    try {
      const found = searchRecursive(drive + '\\', 4, exeNames)
      if (found) return found
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

/** 检查目录是否真的包含 Whisper 模型文件 */
function hasModelFiles(dir: string): boolean {
  try {
    const markers = ['model.bin', 'model.safetensors', 'config.json', 'tokenizer.json']
    const entries = fs.readdirSync(dir)
    return markers.some(m => entries.includes(m))
  } catch {
    return false
  }
}

export function scanLocalModels(whisperExePath?: string): WhisperModelInfo[] {
  const cacheDirs = getCacheDirs(whisperExePath)
  const downloadedIds = new Set<string>()

  for (const cacheDir of cacheDirs) {
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const name = entry.name.toLowerCase()

        // Hugging Face 缓存格式: models--Systran--faster-whisper-large-v3
        const hfMatch = name.match(/^models--[^-]+--faster-whisper-(.+)$/)
        if (hfMatch) {
          // HF 缓存目录下有 blobs/ 子目录包含模型文件，直接信任
          downloadedIds.add(hfMatch[1])
          continue
        }

        // 普通目录：必须包含模型文件才算已下载
        const fullPath = path.join(cacheDir, entry.name)
        if (!hasModelFiles(fullPath)) continue

        downloadedIds.add(name)
        const stripped = name.replace(/^(faster-whisper-|faster-|whisper-)/, '')
        if (stripped !== name) downloadedIds.add(stripped)
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
