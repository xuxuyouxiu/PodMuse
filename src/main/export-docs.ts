/**
 * 笔记导出 — 单篇 PDF / 单篇 Markdown / PDF 合集
 * 渲染 HTML 模板 → 隐藏窗口 printToPDF → 保存对话框（用户自选路径）→ 写文件
 */

import { BrowserWindow, dialog, app } from 'electron'
import { join } from 'node:path'
import * as fs from 'fs'
import { marked } from 'marked'
import { loadConfig } from './config'
import { isPathWithinBase } from './security'

export interface ExportResult {
  success: boolean
  path?: string
  cancelled?: boolean
  error?: string
}

export interface ExportItem {
  notePath: string
  title: string
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const fmEnd = md.indexOf('\n---', 3)
  return fmEnd > 0 ? md.substring(fmEnd + 4) : md
}

/** 笔记固定模块标题（提取标题时跳过） */
const MODULE_TITLES = new Set([
  '一句话总结',
  '本期主要内容',
  '核心观点',
  '事件详情',
  '事件详情与深度分析',
  '金句摘录',
  '术语词典',
  '术语词典（索引）',
  '关联实体索引',
  '关联人物',
  '关联项目',
  '关联概念',
])

/** 提取笔记标题：优先传入标题；无则取第一个非模块 # 标题；再兜底文件名 */
function extractTitle(md: string, fallback: string): string {
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('#')) continue
    const title = t.replace(/^#+\s*/, '').trim()
    if (title && !MODULE_TITLES.has(title)) return title
  }
  return fallback
}

/** markdown → 安全的正文 HTML（剥 frontmatter，保留链接/列表/引用） */
function mdToHtml(md: string): string {
  const body = stripFrontmatter(md)
  const html = marked.parse(body, { breaks: true }) as string
  // 清洗危险标签
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40)
  return clean || '笔记'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function renderPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    width: 794, // A4 @96dpi
    height: 1123,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  })
  try {
    const templatePath = join(__dirname, '..', '..', 'dist', 'note-pdf.html')
    const template = fs.readFileSync(templatePath, 'utf-8')
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(template.replace('<!-- CONTENT -->', html))
    await win.loadURL(dataUrl)
    await sleep(400) // 等字体渲染
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
      footerTemplate:
        '<div style="font-size:9px;color:#999;width:100%;text-align:center;padding:4px 0;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      headerTemplate: '<div></div>',
      displayHeaderFooter: true,
    })
    return Buffer.from(pdf)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function showSaveDialog(defaultName: string, filterName: string, ext: string): Promise<string | null> {
  const defaultDir = app.getPath('desktop')
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '保存导出文件',
    defaultPath: join(defaultDir, defaultName),
    filters: [{ name: filterName, extensions: [ext] }],
  })
  if (canceled || !filePath) return null
  return filePath
}

function assertSafeNotePath(notePath: string): string {
  const config = loadConfig()
  const allowedDirs = [config.obsidian_dir, app.getPath('userData')].filter(Boolean)
  if (!isPathWithinBase(notePath, allowedDirs)) {
    throw new Error('路径不在允许范围内')
  }
  if (!fs.existsSync(notePath)) {
    throw new Error('笔记文件不存在')
  }
  return fs.readFileSync(notePath, 'utf-8')
}

/** 导出单篇 PDF */
export async function exportNotePdf(params: { notePath: string; title?: string }): Promise<ExportResult> {
  try {
    const md = assertSafeNotePath(params.notePath)
    if (!md.trim()) return { success: false, error: '笔记为空' }
    const title = params.title?.trim() || extractTitle(md, '笔记')
    const html = mdToHtml(md)
    const pdf = await renderPdf(`<article class="note"><h1>${escapeHtml(title)}</h1>${html}</article>`)
    const filePath = await showSaveDialog(`PodMuse-笔记-${sanitizeFilename(title)}.pdf`, 'PDF 文档', 'pdf')
    if (!filePath) return { success: true, cancelled: true }
    fs.writeFileSync(filePath, pdf)
    return { success: true, path: filePath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 导出单篇 Markdown（原文另存） */
export async function exportNoteMd(params: { notePath: string; title?: string }): Promise<ExportResult> {
  try {
    const md = assertSafeNotePath(params.notePath)
    if (!md.trim()) return { success: false, error: '笔记为空' }
    const title = params.title?.trim() || extractTitle(md, '笔记')
    const filePath = await showSaveDialog(`PodMuse-笔记-${sanitizeFilename(title)}.md`, 'Markdown 文档', 'md')
    if (!filePath) return { success: true, cancelled: true }
    fs.writeFileSync(filePath, md, 'utf-8')
    return { success: true, path: filePath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 导出 PDF 合集（封面 + 目录 + 各篇正文，每篇新页） */
export async function exportCollectionPdf(params: { items: ExportItem[] }): Promise<ExportResult> {
  try {
    const items = (params.items || []).filter(i => i && i.notePath).slice(0, 50)
    if (items.length === 0) return { success: false, error: '未选择任何笔记' }

    // 封面
    const now = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    let html = `<section class="cover">
      <div class="cover__brand">PodMuse</div>
      <h1 class="cover__title">播客笔记合集</h1>
      <div class="cover__meta">共 ${items.length} 篇 · ${now}</div>
    </section>`

    // 目录
    html += `<section class="toc"><h2>目录</h2><ol>`
    const entries: { title: string; html: string }[] = []
    for (const item of items) {
      let md = ''
      try {
        md = assertSafeNotePath(item.notePath)
      } catch {
        continue
      }
      const title = item.title?.trim() || extractTitle(md, '未命名笔记')
      entries.push({ title, html: mdToHtml(md) })
    }
    for (const e of entries) {
      html += `<li>${escapeHtml(e.title)}</li>`
    }
    html += `</ol></section>`

    // 正文（每篇新页）
    for (const e of entries) {
      html += `<section class="page"><article class="note"><h1>${escapeHtml(e.title)}</h1>${e.html}</article></section>`
    }

    const pdf = await renderPdf(html)
    const filePath = await showSaveDialog(`PodMuse-笔记合集-${todayStr()}.pdf`, 'PDF 文档', 'pdf')
    if (!filePath) return { success: true, cancelled: true }
    fs.writeFileSync(filePath, pdf)
    return { success: true, path: filePath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
