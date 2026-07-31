import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import * as fs from 'fs/promises'
import { loadConfig } from '../config'
import { searchEnhanced, getFacets } from '../search'
import type { SearchParams, SearchResponse, SearchFacets } from '../search'

interface NoteSearchResult {
  path: string
  name: string
  excerpt: string
  type: string
}

export function registerSearchIPC(_mainWindow?: BrowserWindow | null): void {
  // Legacy: simple substring search (kept for backward compat with Header Ctrl+K)
  ipcMain.handle('search:notes', async (_e, keyword: string): Promise<NoteSearchResult[]> => {
    const config = loadConfig()
    const obsidianDir = config.obsidian_dir?.trim()
    if (!obsidianDir) return []

    try {
      await fs.access(obsidianDir)
    } catch {
      return []
    }

    const query = keyword.trim().toLowerCase()
    if (!query) return []

    const results: NoteSearchResult[] = []

    async function walkDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= 30) return
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            await walkDir(fullPath)
          } else if (entry.name.endsWith('.md')) {
            const nameLower = entry.name.toLowerCase()
            let content = ''
            try {
              content = await fs.readFile(fullPath, 'utf-8')
            } catch {
              continue
            }
            const contentLower = content.toLowerCase()

            if (nameLower.includes(query) || contentLower.includes(query)) {
              let excerpt = ''
              const idx = contentLower.indexOf(query)
              if (idx >= 0) {
                const start = Math.max(0, idx - 40)
                const end = Math.min(content.length, idx + query.length + 80)
                excerpt =
                  (start > 0 ? '...' : '') +
                  content.slice(start, end).replace(/\n/g, ' ').trim() +
                  (end < content.length ? '...' : '')
              } else {
                excerpt = content.slice(0, 120).replace(/\n/g, ' ').trim()
              }

              let type = '笔记'
              const relPath = fullPath.slice(obsidianDir.length)
              if (relPath.includes('人物')) type = '人物'
              else if (relPath.includes('项目')) type = '项目'
              else if (relPath.includes('概念')) type = '概念'
              else if (relPath.includes('术语')) type = '术语'

              results.push({
                path: fullPath,
                name: entry.name.replace(/\.md$/, ''),
                excerpt,
                type,
              })
            }
          }
        }
      } catch {}
    }

    await walkDir(obsidianDir)
    return results.slice(0, 30)
  })

  // New: enhanced search with filters, facets, pagination, highlight
  ipcMain.handle('search:enhanced', async (_e, params: SearchParams): Promise<SearchResponse> => {
    const config = loadConfig()
    const obsidianDir = config.obsidian_dir?.trim() || ''
    return searchEnhanced(obsidianDir, params || {})
  })

  // New: get all facets for current library (cached by dir mtime)
  ipcMain.handle('search:facets', async (): Promise<SearchFacets> => {
    const config = loadConfig()
    const obsidianDir = config.obsidian_dir?.trim() || ''
    return getFacets(obsidianDir)
  })
}
