import { useMemo, useRef, useEffect } from 'react'
import { marked } from 'marked'

/** 简单清理：移除 script 标签等危险内容 */
export function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
}

/** 剥离 YAML frontmatter */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const fmEnd = md.indexOf('\n---', 3)
  return fmEnd > 0 ? md.substring(fmEnd + 4) : md
}

/**
 * 将 Obsidian wiki-link 转换为标准 Markdown 链接
 * - [[名称]]       → [名称](名称.md)
 * - [[名称|别名]]  → [别名](名称.md)
 * 转换后由 NotesPanel 的全局文件名解析找到实际文件（Obsidian 全局解析语义）
 */
export function convertWikiLinksToMd(md: string): string {
  return md.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_m, name: string, alias?: string) => {
    const target = (name || '').trim()
    const label = (alias || name || '').trim()
    if (!target) return _m
    return `[${label}](${target}.md)`
  })
}

interface Props {
  content: string
  className?: string
  /** 链接 hover 事件（href 为 .md 文件绝对路径或相对路径） */
  onLinkHover?: (href: string, el: HTMLElement) => void
  onLinkLeave?: () => void
  onLinkClick?: (href: string) => void
}

/**
 * Markdown 渲染组件 — Obsidian 风格外观
 * 渲染后的链接通过事件冒泡交给父组件处理悬停预览/跳转
 */
export default function NoteMarkdown({
  content,
  className,
  onLinkHover,
  onLinkLeave,
  onLinkClick,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    try {
      return sanitizeHtml(
        marked.parse(convertWikiLinksToMd(stripFrontmatter(content)), { breaks: true }) as string,
      )
    } catch {
      return `<pre>${content.replace(/</g, '&lt;')}</pre>`
    }
  }, [content])

  // 渲染完成后为所有内部链接绑定事件
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href]')
    const onEnter = (e: MouseEvent) => {
      const a = e.currentTarget as HTMLAnchorElement
      const href = a.getAttribute('href') || ''
      if (href.startsWith('http')) return // 外部链接不预览
      onLinkHover?.(href, a)
    }
    const onLeave = () => onLinkLeave?.()
    const onClick = (e: MouseEvent) => {
      const a = e.currentTarget as HTMLAnchorElement
      const href = a.getAttribute('href') || ''
      if (href.startsWith('http')) return
      e.preventDefault()
      onLinkClick?.(href)
    }

    anchors.forEach(a => {
      a.addEventListener('mouseenter', onEnter)
      a.addEventListener('mouseleave', onLeave)
      a.addEventListener('click', onClick)
    })
    return () => {
      anchors.forEach(a => {
        a.removeEventListener('mouseenter', onEnter)
        a.removeEventListener('mouseleave', onLeave)
        a.removeEventListener('click', onClick)
      })
    }
  }, [html, onLinkHover, onLinkLeave, onLinkClick])

  return (
    <div
      ref={ref}
      className={`markdown-body ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
