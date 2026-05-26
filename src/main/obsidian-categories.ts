import * as path from 'path'
import * as fs from 'fs'

export interface CategoryConfig {
  version: 1
  categories: Array<{ id: string; name: string; priority: number }>
  rules: Array<{ match: string; categoryId: string; weight: number }>
}

const DEFAULT_CATEGORIES = [
  { id: 'tech', name: '科技类', priority: 100 },
  { id: 'business', name: '商业财经类', priority: 90 },
  { id: 'culture', name: '文化艺术类', priority: 80 },
  { id: 'history', name: '历史社科类', priority: 70 },
  { id: 'career', name: '职场成长类', priority: 60 },
  { id: 'life', name: '生活方式类', priority: 50 },
  { id: 'science', name: '学术科普类', priority: 40 },
  { id: 'other', name: '其他', priority: 0 },
]

export function getDefaultCategoryConfig(): CategoryConfig {
  return { version: 1, categories: DEFAULT_CATEGORIES, rules: [] }
}

export function loadOrInitCategoryConfig(obsidianDir: string, configPath?: string): CategoryConfig {
  const cfgPath = configPath || path.join(obsidianDir, 'podcast_categories.json')
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      return raw as CategoryConfig
    } catch {
      console.error('分类配置文件解析失败，使用默认配置')
    }
  }
  const defaults = getDefaultCategoryConfig()
  try {
    if (!fs.existsSync(obsidianDir)) fs.mkdirSync(obsidianDir, { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify(defaults, null, 2), 'utf-8')
  } catch (e) {
    console.error('创建默认分类配置文件失败:', e)
  }
  return defaults
}

export function pickCategoryName(tags: string[], cfg: CategoryConfig): string {
  const byId = new Map(cfg.categories.map(c => [c.id, c]))
  const score = new Map<string, number>()
  for (const c of cfg.categories) score.set(c.id, 0)

  for (const tag of tags) {
    for (const rule of cfg.rules) {
      if (rule.match === tag && byId.has(rule.categoryId)) {
        score.set(rule.categoryId, (score.get(rule.categoryId) || 0) + rule.weight)
      }
    }
  }

  const other = cfg.categories.find(c => c.id === 'other')?.name || '其他'
  let bestId: string | null = null
  let bestScore = 0
  let bestPriority = -Infinity
  for (const c of cfg.categories) {
    const s = score.get(c.id) || 0
    if (s <= 0) continue
    if (s > bestScore || (s === bestScore && c.priority > bestPriority)) {
      bestId = c.id
      bestScore = s
      bestPriority = c.priority
    }
  }
  if (!bestId) return other
  return byId.get(bestId)!.name
}

export function parseTagsFromMarkdown(md: string): string[] {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n/m)
  if (!m) return []
  const fm = m[1]
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m)
  if (inline) {
    return inline[1].split(/[,，]/).map(s => s.trim()).filter(Boolean)
  }
  const lines = fm.split(/\r?\n/)
  let inList = false
  const tags: string[] = []
  for (const line of lines) {
    if (!inList) {
      if (/^tags:\s*$/.test(line)) { inList = true; continue }
    } else {
      const li = line.match(/^\s*-\s*(.+)\s*$/)
      if (li) { tags.push(li[1].trim()) }
      else if (/^\S/.test(line)) break
    }
  }
  return tags
}

export function sanitizePathSegment(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return cleaned || '未命名'
}

export interface MigrationSummary {
  scanned: number
  moved: number
  renamed: number
  skipped: number
  errors: string[]
}

export function migrateExistingNotes(obsidianDir: string, cfgPath?: string): MigrationSummary {
  const summary: MigrationSummary = { scanned: 0, moved: 0, renamed: 0, skipped: 0, errors: [] }
  const cfg = loadOrInitCategoryConfig(obsidianDir, cfgPath)
  const categoryNames = new Set(cfg.categories.map(c => c.name))
  const cfgFilePath = path.resolve(cfgPath || path.join(obsidianDir, 'podcast_categories.json'))

  try {
    const entries = fs.readdirSync(obsidianDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const fullPath = path.join(obsidianDir, entry.name)
      if (path.resolve(fullPath) === cfgFilePath) continue
      summary.scanned++

      let md: string
      try { md = fs.readFileSync(fullPath, 'utf-8') } catch (e: any) {
        summary.errors.push(`读取失败 ${entry.name}: ${e.message}`)
        continue
      }
      const tags = parseTagsFromMarkdown(md)
      const targetCategory = pickCategoryName(tags, cfg)
      const targetDir = path.join(obsidianDir, sanitizePathSegment(targetCategory))
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
      if (path.dirname(path.resolve(fullPath)) === path.resolve(targetDir)) {
        summary.skipped++
        continue
      }
      const { destPath, wasRenamed } = resolveUniquePath(targetDir, entry.name.replace(/\.md$/i, ''), '.md')
      try {
        fs.renameSync(fullPath, destPath)
        if (wasRenamed) summary.renamed++
        else summary.moved++
      } catch (e: any) {
        summary.errors.push(`移动失败 ${entry.name} -> ${path.basename(destPath)}: ${e.message}`)
      }
    }
  } catch (e: any) {
    summary.errors.push(`扫描目录失败: ${e.message}`)
  }
  return summary
}

export function resolveUniquePath(dir: string, baseName: string, ext: string): { destPath: string; wasRenamed: boolean } {
  const sanitized = sanitizePathSegment(baseName)
  let candidate = path.join(dir, `${sanitized}${ext}`)
  if (!fs.existsSync(candidate)) return { destPath: candidate, wasRenamed: false }
  let idx = 1
  while (true) {
    candidate = path.join(dir, `${sanitized} (${idx})${ext}`)
    if (!fs.existsSync(candidate)) return { destPath: candidate, wasRenamed: true }
    idx++
  }
}
