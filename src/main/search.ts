/**
 * Enhanced search engine for podcast notes.
 *
 * Design:
 * - No external search libs (lunr/flexsearch/fuse.js)
 * - Character-level bigram for Chinese tokenization (no jieba)
 * - Field-weighted scoring (title 5x / tags 3x / content 1x)
 * - On-demand scan (no persistent index), same pattern as buildTagIndex
 * - Facet cache with mtime invalidation
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, FrontmatterMeta, ENTITY_DIRS, buildBacklinkIndex } from './backlinks'

// ── Types ──────────────────────────────────────────────

export interface SearchParams {
  keyword?: string
  filters?: {
    category?: string
    tags?: string[]
    show?: string
    dateFrom?: string  // YYYY-MM-DD inclusive
    dateTo?: string    // YYYY-MM-DD inclusive
    entityRefs?: string[]  // entity names, max 3, OR
  }
  sortBy?: 'score' | 'date_desc' | 'date_asc'
  limit?: number
  offset?: number
}

export interface SearchResult {
  path: string
  title: string
  date?: string
  category?: string
  show?: string
  tags: string[]
  excerpt: string                // HTML-escaped with <mark>...</mark>
  matchType: ('title' | 'content' | 'tags')[]
  score: number
}

export interface SearchFacets {
  categories: { value: string; count: number }[]
  tags: { value: string; count: number }[]
  shows: { value: string; count: number }[]
  dateRange: { earliest?: string; latest?: string }
  topEntities: { value: string; type: string; count: number }[]
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  facets: SearchFacets
}

interface NoteRecord {
  path: string
  fileName: string                 // without extension
  meta: FrontmatterMeta
  content: string                  // full content (cached per scan)
  contentLower: string
  titleLower: string
  tagsLower: string[]
}

// ── Tokenizer (bigram for Chinese, word for English) ──

export function tokenize(query: string): string[] {
  if (!query) return []
  const tokens: string[] = []

  // English/digits: split on non-alphanumeric
  const englishWords = query.toLowerCase().match(/[a-z0-9]+/g) || []
  tokens.push(...englishWords)

  // Chinese: contiguous CJK segments → bigram (or unigram for single chars)
  const chineseSegments = query.match(/[\u4e00-\u9fff]+/g) || []
  for (const seg of chineseSegments) {
    if (seg.length === 1) {
      tokens.push(seg)
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.substring(i, i + 2))
      }
      // Also push the full segment as a token (helps long exact matches)
      if (seg.length > 2) tokens.push(seg)
    }
  }

  // Dedupe
  return [...new Set(tokens)]
}

// ── HTML escape (prevent XSS in excerpt) ──

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Build excerpt with <mark> highlights ──

function buildExcerpt(content: string, contentLower: string, tokens: string[]): string {
  if (tokens.length === 0) {
    // No keyword: show first 160 chars of body (after frontmatter)
    const fmEnd = content.indexOf('\n---', 3)
    const body = fmEnd >= 0 ? content.substring(fmEnd + 4) : content
    return escapeHtml(body.replace(/\n/g, ' ').trim().slice(0, 160)) + (body.length > 160 ? '...' : '')
  }

  // Find first hit position in contentLower
  let firstHit = -1
  for (const tok of tokens) {
    const idx = contentLower.indexOf(tok)
    if (idx >= 0 && (firstHit === -1 || idx < firstHit)) firstHit = idx
  }

  if (firstHit === -1) {
    // No content hit (only title/tags matched): show first 160 chars of body
    const fmEnd = content.indexOf('\n---', 3)
    const body = fmEnd >= 0 ? content.substring(fmEnd + 4) : content
    return escapeHtml(body.replace(/\n/g, ' ').trim().slice(0, 160)) + (body.length > 160 ? '...' : '')
  }

  const ctxStart = Math.max(0, firstHit - 80)
  const ctxEnd = Math.min(content.length, firstHit + 80)
  let excerpt = content.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim()
  if (ctxStart > 0) excerpt = '...' + excerpt
  if (ctxEnd < content.length) excerpt = excerpt + '...'

  // HTML-escape first, then insert <mark> for each token occurrence
  let escaped = escapeHtml(excerpt)
  const escapedLower = escaped.toLowerCase()

  // Replace tokens with <mark> (longest tokens first to avoid double-wrapping)
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length)
  for (const tok of sortedTokens) {
    // Use a placeholder to avoid re-replacing inside existing <mark>
    const marker = `\u0001MARK_${tok.length}_\u0002`
    const regex = new RegExp(escapeRegex(tok), 'gi')
    escaped = escaped.replace(regex, marker)
    escaped = escaped.split(marker).join(`<mark>${escapeHtml(tok)}</mark>`)
  }

  return escaped
}

// ── Build title with <mark> highlights (XSS-safe: escape first, then wrap <mark>) ──

function highlightTitle(title: string, tokens: string[]): string {
  let escaped = escapeHtml(title)
  if (tokens.length === 0) return escaped
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length)
  for (const tok of sortedTokens) {
    const marker = `\u0001MARK_${tok.length}_\u0002`
    const regex = new RegExp(escapeRegex(tok), 'gi')
    escaped = escaped.replace(regex, marker)
    escaped = escaped.split(marker).join(`<mark>${escapeHtml(tok)}</mark>`)
  }
  return escaped
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Scoring ──

function scoreNote(note: NoteRecord, tokens: string[]): {
  score: number
  matchType: ('title' | 'content' | 'tags')[]
} {
  if (tokens.length === 0) return { score: 0, matchType: [] }

  let titleHits = 0
  let tagHits = 0
  let contentHits = 0

  for (const tok of tokens) {
    if (note.titleLower.includes(tok)) titleHits++
    for (const tag of note.tagsLower) {
      if (tag.includes(tok)) { tagHits++; break }
    }
    // Count content hits (cap at 5 per token to avoid spam)
    let idx = 0
    let count = 0
    while ((idx = note.contentLower.indexOf(tok, idx)) !== -1 && count < 5) {
      count++
      idx += tok.length
    }
    contentHits += count
  }

  const matchType: ('title' | 'content' | 'tags')[] = []
  if (titleHits > 0) matchType.push('title')
  if (tagHits > 0) matchType.push('tags')
  if (contentHits > 0) matchType.push('content')

  const score = titleHits * 5 + tagHits * 3 + contentHits * 1
  return { score, matchType }
}

// ── Scan all podcast notes ──

function scanAllNotes(obsidianDir: string): NoteRecord[] {
  const notes: NoteRecord[] = []
  if (!obsidianDir) return notes

  try {
    const topEntries = fs.readdirSync(obsidianDir, { withFileTypes: true })
    for (const entry of topEntries) {
      if (entry.isDirectory()) {
        // Skip entity dirs
        if (ENTITY_DIRS.some(d => d.dir === entry.name)) continue
        // Scan category subdir
        const subDir = path.join(obsidianDir, entry.name)
        try {
          const subEntries = fs.readdirSync(subDir, { withFileTypes: true })
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith('.md')) {
              const rec = readNoteRecord(path.join(subDir, sub.name))
              if (rec) notes.push(rec)
            }
          }
        } catch { /* skip */ }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rec = readNoteRecord(path.join(obsidianDir, entry.name))
        if (rec) notes.push(rec)
      }
    }
  } catch { /* obsidianDir unreadable */ }

  return notes
}

function readNoteRecord(filePath: string): NoteRecord | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const meta = parseFrontmatter(filePath)
    const fileName = path.basename(filePath, '.md')
    const title = meta.title || fileName
    return {
      path: filePath,
      fileName,
      meta,
      content,
      contentLower: content.toLowerCase(),
      titleLower: title.toLowerCase(),
      tagsLower: (meta.tags || []).map(t => t.toLowerCase()),
    }
  } catch {
    return null
  }
}

// ── Apply filters ──

function applyFilters(note: NoteRecord, filters: NonNullable<SearchParams['filters']>): boolean {
  if (filters.category && note.meta.category !== filters.category) return false
  if (filters.show && note.meta.show !== filters.show) return false
  if (filters.tags && filters.tags.length > 0) {
    const noteTags = new Set(note.meta.tags || [])
    const hasAny = filters.tags.some(t => noteTags.has(t))
    if (!hasAny) return false
  }
  if (filters.dateFrom || filters.dateTo) {
    const noteDate = note.meta.date
    if (!noteDate) return false
    if (filters.dateFrom && noteDate < filters.dateFrom) return false
    if (filters.dateTo && noteDate > filters.dateTo) return false
  }
  if (filters.entityRefs && filters.entityRefs.length > 0) {
    // Note must mention at least one entity in content (after frontmatter)
    const fmEnd = note.content.indexOf('\n---', 3)
    const body = fmEnd >= 0 ? note.content.substring(fmEnd + 4) : note.content
    const hasAny = filters.entityRefs.some(name => body.includes(name))
    if (!hasAny) return false
  }
  return true
}

// ── Build facets from a note set ──

function buildFacetsFromNotes(notes: NoteRecord[], obsidianDir: string): SearchFacets {
  const categories = new Map<string, number>()
  const tags = new Map<string, number>()
  const shows = new Map<string, number>()
  let earliest: string | undefined
  let latest: string | undefined

  for (const note of notes) {
    if (note.meta.category) {
      categories.set(note.meta.category, (categories.get(note.meta.category) || 0) + 1)
    }
    for (const t of note.meta.tags || []) {
      tags.set(t, (tags.get(t) || 0) + 1)
    }
    if (note.meta.show) {
      shows.set(note.meta.show, (shows.get(note.meta.show) || 0) + 1)
    }
    if (note.meta.date) {
      if (!earliest || note.meta.date < earliest) earliest = note.meta.date
      if (!latest || note.meta.date > latest) latest = note.meta.date
    }
  }

  // Top 20 entities from backlink index
  const backlinkIndex = buildBacklinkIndex(obsidianDir)
  const topEntities = backlinkIndex
    .map(e => ({
      value: e.entityName,
      type: e.entityType,
      count: e.podcastRefs.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return {
    categories: [...categories.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    tags: [...tags.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    shows: [...shows.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    dateRange: { earliest, latest },
    topEntities,
  }
}

// ── Facet cache ──

interface FacetCache {
  mtime: number
  facets: SearchFacets
}

let facetCache: FacetCache | null = null
const facetCacheDir = { dir: '' }

function getDirMtime(dir: string): number {
  try {
    const stat = fs.statSync(dir)
    return stat.mtimeMs
  } catch {
    return 0
  }
}

// ── Main API: searchEnhanced ──

export function searchEnhanced(obsidianDir: string, params: SearchParams): SearchResponse {
  if (!obsidianDir) {
    return { results: [], total: 0, facets: emptyFacets() }
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
  const offset = Math.max(params.offset ?? 0, 0)
  const sortBy = params.sortBy || 'score'
  const keyword = (params.keyword || '').trim()
  const tokens = tokenize(keyword)
  const filters = params.filters || {}

  const allNotes = scanAllNotes(obsidianDir)

  // Step 1: filter
  const filteredNotes = allNotes.filter(n => applyFilters(n, filters))

  // Step 2: score (only if there's a keyword)
  let scored: { note: NoteRecord; score: number; matchType: ('title' | 'content' | 'tags')[] }[]
  if (keyword) {
    scored = []
    for (const note of filteredNotes) {
      const { score, matchType } = scoreNote(note, tokens)
      if (score > 0) {
        scored.push({ note, score, matchType })
      }
    }
  } else {
    scored = filteredNotes.map(note => ({ note, score: 0, matchType: [] as ('title' | 'content' | 'tags')[] }))
  }

  // Step 3: sort
  if (sortBy === 'score') {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Tiebreak: date desc
      const da = a.note.meta.date || ''
      const db = b.note.meta.date || ''
      return db.localeCompare(da)
    })
  } else if (sortBy === 'date_desc') {
    scored.sort((a, b) => (b.note.meta.date || '').localeCompare(a.note.meta.date || ''))
  } else {
    scored.sort((a, b) => (a.note.meta.date || '').localeCompare(b.note.meta.date || ''))
  }

  const total = scored.length

  // Step 4: paginate
  const page = scored.slice(offset, offset + limit)

  // Step 5: build result + facets
  const results: SearchResult[] = page.map(({ note, score, matchType }) => {
    const title = highlightTitle(note.meta.title || note.fileName, tokens)
    return {
      path: note.path,
      title,
      date: note.meta.date,
      category: note.meta.category,
      show: note.meta.show,
      tags: note.meta.tags || [],
      excerpt: buildExcerpt(note.content, note.contentLower, tokens),
      matchType,
      score,
    }
  })

  // Build facets from the filtered set (so user sees what other facets are available)
  const facets = buildFacetsFromNotes(filteredNotes, obsidianDir)

  return { results, total, facets }
}

// ── Facets only (cached) ──

export function getFacets(obsidianDir: string): SearchFacets {
  if (!obsidianDir) return emptyFacets()

  const mtime = getDirMtime(obsidianDir)
  if (facetCache && facetCacheDir.dir === obsidianDir && facetCache.mtime === mtime) {
    return facetCache.facets
  }

  const allNotes = scanAllNotes(obsidianDir)
  const facets = buildFacetsFromNotes(allNotes, obsidianDir)

  facetCache = { mtime, facets }
  facetCacheDir.dir = obsidianDir
  return facets
}

function emptyFacets(): SearchFacets {
  return {
    categories: [],
    tags: [],
    shows: [],
    dateRange: {},
    topEntities: [],
  }
}

// ── Invalidate cache (called when notes change) ──

export function invalidateFacetCache(): void {
  facetCache = null
}
