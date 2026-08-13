/**
 * 分享卡片生成 — 笔记一键生成 1080×1440 分享图
 * 隐藏 BrowserWindow 渲染 HTML 模板 → capturePage 截图 → 保存对话框 → 写文件
 */

import { BrowserWindow, dialog, shell, app } from 'electron'
import { join } from 'node:path'
import * as fs from 'fs'
import { loadConfig } from './config'
import { isPathWithinBase } from './security'

interface ShareParams {
  notePath: string
  title: string
  podcastName?: string
  platform?: string
}

export interface ShareResult {
  success: boolean
  path?: string
  cancelled?: boolean
  error?: string
}

/** 从 markdown 提取要点（- 列表项 / 加粗行 / 段落），剥除符号，最多 3 条 */
function extractPoints(md: string): string[] {
  const lines = md.split(/\r?\n/)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (text: string) => {
    const clean = text
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/^#+\s*/, '')
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .trim()
    if (!clean || clean.length < 4 || seen.has(clean)) return
    if (clean.length > 60) return
    seen.add(clean)
    out.push(clean)
  }
  for (const line of lines) {
    if (out.length >= 3) break
    const t = line.trim()
    if (!t) continue
    if (/^[-*]\s+/.test(t)) push(t)
  }
  // 列表项不足时用正文段落补
  if (out.length < 3) {
    for (const line of lines) {
      if (out.length >= 3) break
      const t = line.trim()
      if (!t || t.startsWith('#') || t.startsWith('>') || t.startsWith('|') || t.startsWith('```')) continue
      if (/^[-*]\s+/.test(t)) continue
      push(t)
    }
  }
  return out
}

/** 从 markdown 提取实体 chips（[[人物]] 等，最多 4 个，按出现顺序） */
function extractChips(md: string): { name: string; type: string }[] {
  const typePatterns: { type: string; re: RegExp }[] = [
    { type: 'person', re: /\[\[(人物[\\/][^\]|]+)\]\]/g },
    { type: 'concept', re: /\[\[(概念[\\/][^\]|]+)\]\]/g },
    { type: 'project', re: /\[\[(项目[\\/][^\]|]+)\]\]/g },
    { type: 'term', re: /\[\[(术语[\\/][^\]|]+)\]\]/g },
  ]
  const out: { name: string; type: string }[] = []
  const seen = new Set<string>()
  for (const { type, re } of typePatterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(md)) !== null && out.length < 4) {
      const name = m[1].split(/[\\/]/).pop() || m[1]
      if (seen.has(name)) continue
      seen.add(name)
      out.push({ name, type })
    }
  }
  // 兜底：无类型前缀的 wiki 链接
  if (out.length === 0) {
    const re2 = /\[\[([^\]|]+)\]\]/g
    let m: RegExpExecArray | null
    while ((m = re2.exec(md)) !== null && out.length < 4) {
      const raw = m[1].split(/[\\/]/).pop() || m[1]
      if (seen.has(raw)) continue
      seen.add(raw)
      out.push({ name: raw, type: 'term' })
    }
  }
  return out
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40)
  return clean || '分享'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function renderAndCapture(query: Record<string, string>): Promise<Buffer> {
  const win = new BrowserWindow({
    width: 1080,
    height: 1440,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  })
  try {
    const htmlPath = join(__dirname, '..', '..', 'dist', 'share-card.html')
    await win.loadFile(htmlPath, { query })
    // 等待字体渲染完成（模板底部有 ready 标记）
    for (let i = 0; i < 30; i++) {
      const ready = await win.webContents.executeJavaScript('document.body.dataset.ready === "1"')
      if (ready) break
      await sleep(100)
    }
    await sleep(300)
    const image = await win.webContents.capturePage()
    return image.toPNG()
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export async function generateShareCard(params: ShareParams): Promise<ShareResult> {
  try {
    // 路径安全校验（同 notes:read）
    const config = loadConfig()
    const allowedDirs = [config.obsidian_dir, app.getPath('userData')].filter(Boolean)
    if (!isPathWithinBase(params.notePath, allowedDirs)) {
      return { success: false, error: '路径不在允许范围内' }
    }
    if (!fs.existsSync(params.notePath)) {
      return { success: false, error: '笔记文件不存在' }
    }
    const md = fs.readFileSync(params.notePath, 'utf-8')
    if (!md.trim()) {
      return { success: false, error: '笔记读取失败：文件不存在或为空' }
    }

    const points = extractPoints(md)
    const chips = extractChips(md)
    const title = params.title || extractTitle(md)

    const png = await renderAndCapture({
      title: encodeURIComponent(title),
      podcast: encodeURIComponent(params.podcastName || ''),
      platform: encodeURIComponent(params.platform || ''),
      points: encodeURIComponent(JSON.stringify(points)),
      chips: encodeURIComponent(JSON.stringify(chips)),
      date: encodeURIComponent(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })),
    })

    const defaultName = `PodMuse-分享-${sanitizeFilename(title)}-${todayStr()}.png`
    const defaultDir = app.getPath('desktop')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '保存分享图',
      defaultPath: join(defaultDir, defaultName),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (canceled || !filePath) {
      return { success: true, cancelled: true }
    }

    fs.writeFileSync(filePath, png)
    shell.showItemInFolder(filePath)
    return { success: true, path: filePath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function extractTitle(md: string): string {
  const first = md
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l.startsWith('#'))
  if (first) return first.replace(/^#+\s*/, '').trim()
  return '本期节目'
}
