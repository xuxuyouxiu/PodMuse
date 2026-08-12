/**
 * QA 检索层 — Retriever 接口抽象
 *
 * 本期实现 KeywordRetriever（bigram 关键词检索）。
 * 接口已为后续向量检索（本地 embedding + 向量库）预留：实现 Retriever 接口即可插拔替换。
 */

import fs from 'node:fs'
import path from 'node:path'
import { tokenize } from './search'
import { parseFrontmatter, ENTITY_DIRS } from './backlinks'

// ── Types ──────────────────────────────────────────────

export interface RetrievedChunk {
  /** 笔记绝对路径 */
  path: string
  /** 笔记标题（frontmatter.title 或文件名） */
  title: string
  /** 命中上下文片段（纯文本，去 markdown 语法） */
  excerpt: string
  /** 相关度分数 */
  score: number
  /** 实体类型（若来自实体卡片目录） */
  entityType?: string
}

/** 统一检索接口：未来 VectorRetriever 实现同一接口 */
export interface Retriever {
  retrieve(query: string, topK: number): Promise<RetrievedChunk[]>
}

// ── KeywordRetriever ───────────────────────────────────

const STRIP_MD_RE = /[#*`>\[\]()!_~-]/g

export class KeywordRetriever implements Retriever {
  private obsidianDir: string

  constructor(obsidianDir: string) {
    this.obsidianDir = obsidianDir
  }

  async retrieve(query: string, topK: number): Promise<RetrievedChunk[]> {
    if (!this.obsidianDir || !fs.existsSync(this.obsidianDir)) return []

    const tokens = tokenize(query)
    if (tokens.length === 0) return []

    const chunks: RetrievedChunk[] = []
    const scanDir = (dir: string, depth: number) => {
      if (depth > 2) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          scoreFile(fullPath, entry.name)
        }
      }
    }

    const scoreFile = (filePath: string, fileName: string) => {
      let content: string
      try {
        content = fs.readFileSync(filePath, 'utf-8')
      } catch {
        return
      }
      const contentLower = content.toLowerCase()
      const meta = parseFrontmatter(filePath)
      const title = meta.title || fileName.replace(/\.md$/i, '')
      const titleLower = title.toLowerCase()

      // 计算分数：标题命中 5x，正文命中按次数
      let score = 0
      const titleHits = tokens.filter(t => titleLower.includes(t)).length
      score += titleHits * 5
      for (const t of tokens) {
        let idx = contentLower.indexOf(t)
        let count = 0
        while (idx !== -1 && count < 10) {
          count++
          idx = contentLower.indexOf(t, idx + t.length)
        }
        score += count
      }
      if (score === 0) return

      // 提取命中片段（第一个 token 的位置）
      const firstIdx = Math.min(
        ...tokens
          .map(t => contentLower.indexOf(t))
          .filter(i => i >= 0),
      )
      const ctxStart = Math.max(0, firstIdx - 150)
      const ctxEnd = Math.min(content.length, firstIdx + 300)
      const excerpt = content
        .slice(ctxStart, ctxEnd)
        .replace(/^---[\s\S]*?---/, '') // 去掉 frontmatter
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接去语法
        .replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, '$1') // wiki-link 去语法
        .replace(STRIP_MD_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!excerpt) return

      // 实体类型（人物/项目/概念/术语）
      const dirName = path.basename(path.dirname(filePath))
      const entityType = ENTITY_DIRS.some(d => d.dir === dirName) ? dirName : undefined

      chunks.push({ path: filePath, title, excerpt, score, entityType })
    }

    scanDir(this.obsidianDir, 0)

    chunks.sort((a, b) => b.score - a.score)
    return chunks.slice(0, topK)
  }
}

// 供测试与 future VectorRetriever 参考的文件遍历工具
export function listNoteFiles(obsidianDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 2) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full)
    }
  }
  walk(obsidianDir, 0)
  return files
}
