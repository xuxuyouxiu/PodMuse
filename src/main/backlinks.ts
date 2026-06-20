import fs from 'node:fs'
import path from 'node:path'

// ── Types ──────────────────────────────────────────────

export interface PodcastRef {
  path: string
  title: string
  date?: string
  category?: string
  show?: string
}

export interface BacklinkEntry {
  entityName: string
  entityType: 'people' | 'projects' | 'concepts' | 'terms'
  podcastRefs: PodcastRef[]
}

export type BacklinkIndex = BacklinkEntry[]

// ── Entity subdirectories ──────────────────────────────

const ENTITY_DIRS: { dir: string; type: BacklinkEntry['entityType'] }[] = [
  { dir: '人物', type: 'people' },
  { dir: '项目', type: 'projects' },
  { dir: '概念', type: 'concepts' },
  { dir: '术语', type: 'terms' },
]

// ── Wiki-link regex (matches [[name]] but not [[name|alias]]) ──
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g

// ── Frontmatter parser (read first ~30 lines) ──

interface FrontmatterMeta {
  date?: string
  category?: string
  show?: string
  type?: string
}

function parseFrontmatter(filePath: string): FrontmatterMeta {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(4096) // frontmatter is small
    const bytesRead = fs.readSync(fd, buf, 0, 4096, 0)
    fs.closeSync(fd)
    const head = buf.toString('utf-8', 0, bytesRead)

    if (!head.startsWith('---')) return {}

    const endIndex = head.indexOf('\n---', 3)
    if (endIndex === -1) return {}

    const yaml = head.substring(3, endIndex)
    const meta: FrontmatterMeta = {}

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.substring(0, colonIdx).trim()
      let value = line.substring(colonIdx + 1).trim()
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      if (key === 'date') meta.date = value
      else if (key === 'category') meta.category = value
      else if (key === 'show') meta.show = value
      else if (key === 'type') meta.type = value
    }

    return meta
  } catch {
    return {}
  }
}

// ── Extract podcast filename from entity card ──

function extractPodcastLinks(entityFilePath: string): string[] {
  try {
    const content = fs.readFileSync(entityFilePath, 'utf-8')
    const links: string[] = []

    // Look for wiki-links that reference podcast notes
    // Podcast notes live in category subdirs (科技商业/, 每日资讯/, etc.)
    // or the root obsidian dir
    // Entity cards reference them as [[podcast-title]]
    // We extract ALL wiki-links from the file; the caller will resolve paths
    let match: RegExpExecArray | null
    WIKILINK_RE.lastIndex = 0
    while ((match = WIKILINK_RE.exec(content)) !== null) {
      links.push(match[1])
    }
    return links
  } catch {
    return []
  }
}

// ── Build podcast file map (filename -> full path) ──

function buildPodcastFileMap(obsidianDir: string): Map<string, string> {
  const map = new Map<string, string>()
  try {
    const entries = fs.readdirSync(obsidianDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip entity directories
        if (ENTITY_DIRS.some(d => d.dir === entry.name)) continue
        // Scan category subdirectories for .md files
        const subDir = path.join(obsidianDir, entry.name)
        try {
          const subEntries = fs.readdirSync(subDir, { withFileTypes: true })
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith('.md')) {
              const nameWithoutExt = sub.name.replace(/\.md$/i, '')
              map.set(nameWithoutExt, path.join(subDir, sub.name))
            }
          }
        } catch { /* skip unreadable dirs */ }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Root-level .md files
        const nameWithoutExt = entry.name.replace(/\.md$/i, '')
        map.set(nameWithoutExt, path.join(obsidianDir, entry.name))
      }
    }
  } catch { /* obsidianDir unreadable */ }
  return map
}

// ── Public API ──

export function buildBacklinkIndex(obsidianDir: string): BacklinkIndex {
  if (!obsidianDir || !fs.existsSync(obsidianDir)) {
    console.warn('[backlinks] Obsidian directory not found:', obsidianDir)
    return []
  }

  // 1. Build podcast file map for path resolution
  const podcastMap = buildPodcastFileMap(obsidianDir)

  // 2. Cache frontmatter metadata for quick lookup
  const metaCache = new Map<string, FrontmatterMeta>()
  for (const [name, fullPath] of podcastMap) {
    metaCache.set(name, parseFrontmatter(fullPath))
  }

  // 3. Scan entity directories
  const index: BacklinkIndex = []

  for (const { dir, type } of ENTITY_DIRS) {
    const entityDir = path.join(obsidianDir, dir)
    if (!fs.existsSync(entityDir)) continue

    let entityFiles: string[]
    try {
      entityFiles = fs.readdirSync(entityDir).filter(f => f.endsWith('.md'))
    } catch {
      continue
    }

    for (const file of entityFiles) {
      const filePath = path.join(entityDir, file)
      const entityName = file.replace(/\.md$/i, '')
      const podcastLinks = extractPodcastLinks(filePath)

      // Resolve podcast links to PodcastRef objects
      const podcastRefs: PodcastRef[] = []
      const seen = new Set<string>()

      for (const linkName of podcastLinks) {
        if (seen.has(linkName)) continue
        seen.add(linkName)

        const podcastPath = podcastMap.get(linkName)
        if (!podcastPath) continue

        const meta = metaCache.get(linkName) || {}
        podcastRefs.push({
          path: podcastPath,
          title: linkName,
          date: meta.date,
          category: meta.category,
          show: meta.show,
        })
      }

      // Sort by date descending (most recent first)
      podcastRefs.sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      })

      if (podcastRefs.length > 0) {
        index.push({ entityName, entityType: type, podcastRefs })
      }
    }
  }

  // Sort index: entities with most references first
  index.sort((a, b) => b.podcastRefs.length - a.podcastRefs.length)

  return index
}
