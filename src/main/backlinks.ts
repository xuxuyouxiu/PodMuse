import fs from 'node:fs'
import path from 'node:path'

// ── Types ──────────────────────────────────────────────

export interface PodcastRef {
  path: string
  title: string
  date?: string
  category?: string
  show?: string
  episode?: string
  context?: string
}

export interface BacklinkEntry {
  entityName: string
  entityType: 'people' | 'projects' | 'concepts' | 'terms'
  podcastRefs: PodcastRef[]
}

export type BacklinkIndex = BacklinkEntry[]

// ── Entity subdirectories ──────────────────────────────

export const ENTITY_DIRS: { dir: string; type: BacklinkEntry['entityType'] }[] = [
  { dir: '人物', type: 'people' },
  { dir: '项目', type: 'projects' },
  { dir: '概念', type: 'concepts' },
  { dir: '术语', type: 'terms' },
]

// ── Normalize link names for fuzzy matching ──
// Handles edge cases like trailing dots mismatch (filename has 4 dots, wiki-link has 3)
// Exported for testing & reuse
export function normalizeLinkName(name: string): string {
  return name
    .replace(/[\s.…·]+$/g, '')
    .replace(/\.+$/, '')
    .trim()
}

// ── Wiki-link regex (matches [[name]] but not [[name|alias]]) ──
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g

// ── Frontmatter parser (read first ~30 lines) ──

export interface FrontmatterMeta {
  date?: string
  category?: string
  show?: string
  type?: string
  episode?: string
  tags?: string[]
  title?: string
  host?: string
  guest?: string
  platform?: string
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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (key === 'date') meta.date = value
      else if (key === 'category') meta.category = value
      else if (key === 'show') meta.show = value
      else if (key === 'type') meta.type = value
      else if (key === 'episode') meta.episode = value
      else if (key === 'title') meta.title = value
      else if (key === 'host') meta.host = value
      else if (key === 'guest') meta.guest = value
      else if (key === 'platform') meta.platform = value
      else if (key === 'tags') {
        // Parse YAML array: tags: [AI, 创业, 大语言模型]
        const arrMatch = value.match(/^\[(.+)\]$/)
        if (arrMatch) {
          meta.tags = arrMatch[1]
            .split(',')
            .map(t => t.trim().replace(/["']/g, ''))
            .filter(t => t.length > 0)
        }
      }
    }

    return meta
  } catch {
    return {}
  }
}

// Export parseFrontmatter so search module can reuse it
export { parseFrontmatter }

// ── Extract wiki-link names from arbitrary markdown content ──
export function extractWikiLinks(content: string): string[] {
  const links: string[] = []
  let match: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    links.push(match[1])
  }
  return links
}

// ── Extract podcast filename from entity card ──

function extractPodcastLinks(entityFilePath: string): string[] {
  try {
    const content = fs.readFileSync(entityFilePath, 'utf-8')
    return extractWikiLinks(content)
  } catch {
    return []
  }
}

// ── Build podcast file map (filename -> full path) ──

function buildPodcastFileMap(obsidianDir: string): {
  exact: Map<string, string>
  normalized: Map<string, string>
} {
  const exact = new Map<string, string>()
  const normalized = new Map<string, string>()
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
              const fullPath = path.join(subDir, sub.name)
              exact.set(nameWithoutExt, fullPath)
              normalized.set(normalizeLinkName(nameWithoutExt), fullPath)
            }
          }
        } catch {
          /* skip unreadable dirs */
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Root-level .md files
        const nameWithoutExt = entry.name.replace(/\.md$/i, '')
        const fullPath = path.join(obsidianDir, entry.name)
        exact.set(nameWithoutExt, fullPath)
        normalized.set(normalizeLinkName(nameWithoutExt), fullPath)
      }
    }
  } catch {
    /* obsidianDir unreadable */
  }
  return { exact, normalized }
}

// ── Extract context summary from a podcast note around an entity mention ──

function extractContextSummary(notePath: string, entityName: string): string | undefined {
  try {
    const content = fs.readFileSync(notePath, 'utf-8')
    // Search for the entity name in the content (after frontmatter)
    const frontmatterEnd = content.indexOf('\n---', 3)
    const body = frontmatterEnd >= 0 ? content.substring(frontmatterEnd + 4) : content
    const pos = body.indexOf(entityName)
    if (pos === -1) return undefined

    const start = Math.max(0, pos - 100)
    const end = Math.min(body.length, pos + entityName.length + 100)
    let snippet = body.substring(start, end)
    // Clean up markdown syntax for readability
    snippet = snippet
      .replace(/^#+\s*/gm, '')
      .replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
    if (start > 0) snippet = '…' + snippet
    if (end < body.length) snippet = snippet + '…'
    return snippet
  } catch {
    return undefined
  }
}

// ── Public API ──

export function buildBacklinkIndex(obsidianDir: string): BacklinkIndex {
  if (!obsidianDir || !fs.existsSync(obsidianDir)) {
    console.warn('[backlinks] Obsidian directory not found:', obsidianDir)
    return []
  }

  // 1. Build podcast file map for path resolution
  const { exact: podcastMap, normalized: normalizedMap } = buildPodcastFileMap(obsidianDir)

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

        // Try exact match first, then normalized fuzzy match
        let podcastPath = podcastMap.get(linkName)
        if (!podcastPath) {
          podcastPath = normalizedMap.get(normalizeLinkName(linkName))
        }
        if (!podcastPath) continue

        const meta = metaCache.get(linkName) || metaCache.get(normalizeLinkName(linkName)) || {}
        podcastRefs.push({
          path: podcastPath,
          title: linkName,
          date: meta.date,
          category: meta.category,
          show: meta.show,
          episode: meta.episode,
          context: extractContextSummary(podcastPath, entityName),
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

// ── Tag Index ──────────────────────────────────────────

export interface TagPodcastRef {
  path: string
  title: string
  date?: string
  category?: string
  show?: string
  tags: string[]
}

export interface TagEntry {
  tagName: string
  count: number
  podcastRefs: TagPodcastRef[]
}

export type TagIndex = TagEntry[]

export function buildTagIndex(obsidianDir: string): TagIndex {
  if (!obsidianDir || !fs.existsSync(obsidianDir)) {
    console.warn('[tags] Obsidian directory not found:', obsidianDir)
    return []
  }

  // 1. Build podcast file map (reuse existing function)
  const { exact: podcastMap } = buildPodcastFileMap(obsidianDir)

  // 2. Parse frontmatter for each podcast note
  const allPodcasts: { path: string; title: string; meta: FrontmatterMeta }[] = []
  for (const [name, fullPath] of podcastMap) {
    const meta = parseFrontmatter(fullPath)
    allPodcasts.push({ path: fullPath, title: name, meta })
  }

  // 3. Build tag → podcast index
  const tagMap = new Map<string, TagPodcastRef[]>()

  for (const pod of allPodcasts) {
    const tags = pod.meta.tags
    if (!tags || tags.length === 0) continue

    const ref: TagPodcastRef = {
      path: pod.path,
      title: pod.title,
      date: pod.meta.date,
      category: pod.meta.category,
      show: pod.meta.show,
      tags,
    }

    for (const tag of tags) {
      const trimmed = tag.trim()
      if (!trimmed) continue
      if (!tagMap.has(trimmed)) tagMap.set(trimmed, [])
      tagMap.get(trimmed)!.push(ref)
    }
  }

  // 4. Convert to sorted array
  const tagIndex: TagEntry[] = []
  for (const [tagName, refs] of tagMap) {
    // Sort refs by date descending
    refs.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return b.date.localeCompare(a.date)
    })
    tagIndex.push({ tagName, count: refs.length, podcastRefs: refs })
  }

  tagIndex.sort((a, b) => b.count - a.count)

  return tagIndex
}
