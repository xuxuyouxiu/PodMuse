import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  User,
  Briefcase,
  Lightbulb,
  Bookmark,
  X,
} from 'lucide-react'
import NoteMarkdown from './NoteMarkdown'
import { useI18n } from '../i18n'

interface NoteFileEntry {
  name: string
  path: string
  relPath: string
  mtime: number
}

interface NoteDirGroup {
  dir: string
  files: NoteFileEntry[]
}

const ENTITY_DIRS = new Set(['人物', '项目', '概念', '术语'])

const DIR_ICONS: Record<string, { icon: typeof User; color: string }> = {
  人物: { icon: User, color: 'var(--accent)' },
  项目: { icon: Briefcase, color: 'var(--success)' },
  概念: { icon: Lightbulb, color: 'var(--warning)' },
  术语: { icon: Bookmark, color: 'var(--text-muted)' },
}

interface PreviewState {
  content: string
  name: string
  left: number
  top: number
}

/**
 * 笔记库面板 — 左侧文件树 + 右侧 Obsidian 式阅读器 + 链接悬停预览
 */
export default function NotesPanel() {
  const { t } = useI18n()
  const [groups, setGroups] = useState<NoteDirGroup[]>([])
  const [rootDir, setRootDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState('')
  const [currentContent, setCurrentContent] = useState('')
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState('')

  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electronAPI
      .listNotes()
      .then(res => {
        if (res.success) {
          const list = res.groups || []
          setGroups(list)
          // 默认全部折叠，只留分组标题（Obsidian 文件树风格）
          setCollapsed(new Set(list.map(g => g.dir)))
          setRootDir(res.rootDir || null)
        } else {
          setError(res.error || t('加载失败'))
        }
      })
      .catch(e => setError((e as Error).message || t('加载失败')))
      .finally(() => setLoading(false))
  }, [t])

  // 打开笔记
  const openNote = useCallback(
    (path: string, name: string) => {
      setCurrentPath(path)
      setCurrentName(name)
      setReaderLoading(true)
      setReaderError('')
      setPreview(null)
      window.electronAPI
        .readNote(path)
        .then(res => {
          if (res.success && res.content) {
            setCurrentContent(res.content)
          } else {
            setReaderError(res.error || t('读取失败'))
          }
        })
        .catch(e => setReaderError((e as Error).message || t('读取失败')))
        .finally(() => setReaderLoading(false))
    },
    [t],
  )

  // 解析链接 href → 绝对路径
  const resolveHref = useCallback(
    (href: string): string | null => {
      if (!rootDir) return null
      if (href.startsWith('file://')) return decodeURIComponent(href.slice(7))
      if (href.startsWith('/') || /^[a-zA-Z]:/.test(href)) return href.replace(/\\/g, '/')
      if (!currentPath) return null
      const normPath = currentPath.replace(/\\/g, '/')
      const base = normPath.substring(0, normPath.lastIndexOf('/') + 1)
      const parts = (base + href).split('/')
      const stack: string[] = []
      for (const p of parts) {
        if (p === '..') stack.pop()
        else if (p === '.' || p === '') continue
        else stack.push(p)
      }
      return stack.join('/')
    },
    [rootDir, currentPath],
  )

  const loadPreview = useCallback((absPath: string, anchor: DOMRect) => {
    // 用 portal 渲染到 body，位置基于 viewport 坐标
    const left = Math.min(anchor.left, window.innerWidth - 360)
    const top = Math.min(anchor.bottom + 8, window.innerHeight - 320)
    setPreviewLoading(true)
    setPreview({ content: '', name: '', left, top })
    window.electronAPI
      .readNote(absPath)
      .then(res => {
        setPreviewLoading(false)
        if (res.success && res.content) {
          setPreview({
            content: res.content,
            name: res.filename?.replace(/\.md$/i, '') || '',
            left,
            top,
          })
        } else {
          setPreview({ content: '', name: '', left, top })
        }
      })
      .catch(() => {
        setPreviewLoading(false)
        setPreview({ content: '', name: '', left, top })
      })
  }, [])

  const handleLinkHover = useCallback(
    (href: string, el: HTMLElement) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
      const abs = resolveHref(href)
      if (!abs) return
      hoverTimerRef.current = setTimeout(() => {
        loadPreview(abs, el.getBoundingClientRect())
      }, 300)
    },
    [resolveHref, loadPreview],
  )

  const handleLinkLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => setPreview(null), 220)
  }, [])

  const handleLinkClick = useCallback(
    (href: string) => {
      const abs = resolveHref(href)
      if (!abs) return
      const name = abs.split('/').pop()?.replace(/\.md$/i, '') || ''
      openNote(abs, name)
      setPreview(null)
    },
    [resolveHref, openNote],
  )

  const toggleGroup = (dir: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else next.add(dir)
      return next
    })
  }

  if (loading) {
    return (
      <div className="notes-panel notes-panel--status">
        <Loader2 size={18} className="note-preview__spin" />
        {t('加载中...')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="notes-panel notes-panel--status notes-panel--error">
        <AlertCircle size={18} />
        {error}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="notes-panel notes-panel--status">
        <FileText size={20} />
        {t('暂无笔记，先处理一个播客试试')}
      </div>
    )
  }

  return (
    <div className="notes-panel" ref={panelRef}>
      {/* 左侧文件树 */}
      <div className="notes-panel__files">
        <div className="notes-panel__files-title">
          <FolderOpen size={13} />
          {t('笔记库')}
        </div>
        <div className="notes-panel__files-scroll">
          {groups.map(group => {
            const isCollapsed = collapsed.has(group.dir)
            const isEntity = ENTITY_DIRS.has(group.dir)
            const dirMeta = DIR_ICONS[group.dir]
            const DirIcon = dirMeta?.icon || FolderOpen
            return (
              <div key={group.dir} className="notes-panel__group">
                <button className="notes-panel__group-btn" onClick={() => toggleGroup(group.dir)}>
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <DirIcon size={13} style={{ color: dirMeta?.color || 'var(--text-muted)' }} />
                  <span className="notes-panel__group-name">{group.dir}</span>
                  <span className="notes-panel__group-count">{group.files.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="notes-panel__group-files">
                    {group.files.map(file => (
                      <button
                        key={file.path}
                        className={`notes-panel__file ${currentPath === file.path ? 'is-active' : ''}`}
                        onClick={() => openNote(file.path, file.name)}
                        title={file.relPath}
                      >
                        <span className="notes-panel__file-indent" />
                        <FileText size={11} className={isEntity ? 'notes-panel__file-entity' : ''} />
                        <span className="notes-panel__file-name">{file.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧阅读器 */}
      <div className="notes-panel__reader">
        {currentPath ? (
          <>
            <div className="notes-panel__reader-header">
              <span className="notes-panel__reader-title">{currentName}</span>
              <span className="notes-panel__reader-path">
                {currentPath.replace(rootDir || '', '').replace(/^[\\/]+/, '')}
              </span>
            </div>
            <div className="notes-panel__reader-body">
              {readerLoading ? (
                <div className="notes-panel--status">
                  <Loader2 size={18} className="note-preview__spin" />
                  {t('加载中...')}
                </div>
              ) : readerError ? (
                <div className="notes-panel--status notes-panel--error">{readerError}</div>
              ) : (
                <NoteMarkdown
                  content={currentContent}
                  onLinkHover={handleLinkHover}
                  onLinkLeave={handleLinkLeave}
                  onLinkClick={handleLinkClick}
                />
              )}
            </div>
          </>
        ) : (
          <div className="notes-panel--status notes-panel--empty">
            <FileText size={22} />
            <div>{t('从左侧选择一篇笔记开始阅读')}</div>
          </div>
        )}
      </div>

      {/* 悬停预览 — portal 到 body，避免被 transform/motion 容器影响定位 */}
      {preview &&
        createPortal(
          <div
            className="notes-preview-pop"
            style={{ left: preview.left, top: preview.top }}
            onMouseEnter={() => {
              if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
            }}
            onMouseLeave={() => setPreview(null)}
          >
            <div className="notes-preview-pop__head">
              <span className="notes-preview-pop__title">{preview.name || t('加载中...')}</span>
              <button className="notes-preview-pop__close" onClick={() => setPreview(null)}>
                <X size={12} />
              </button>
            </div>
            {previewLoading ? (
              <div className="notes-preview-pop__loading">
                <Loader2 size={14} className="note-preview__spin" />
              </div>
            ) : preview.name ? (
              <NoteMarkdown
                content={preview.content}
                className="notes-preview-pop__body"
                onLinkClick={href => {
                  const abs = resolveHref(href)
                  if (abs) {
                    const name = abs.split('/').pop()?.replace(/\.md$/i, '') || ''
                    openNote(abs, name)
                  }
                  setPreview(null)
                }}
              />
            ) : (
              <div className="notes-preview-pop__empty">{t('笔记不存在')}</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
