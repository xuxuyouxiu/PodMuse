import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { FileText, FolderOpen, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
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

/**
 * 笔记库面板 — 左侧文件列表 + 右侧 Obsidian 式阅读器 + 链接悬停预览
 */
export default function NotesPanel() {
  const { t } = useI18n()
  const [groups, setGroups] = useState<NoteDirGroup[]>([])
  const [rootDir, setRootDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 当前打开的笔记
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState('')
  const [currentContent, setCurrentContent] = useState('')
  const [readerLoading, setReaderLoading] = useState(false)
  const [readerError, setReaderError] = useState('')

  // 悬停预览状态
  const [preview, setPreview] = useState<{
    content: string
    name: string
    x: number
    y: number
  } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI
      .listNotes()
      .then(res => {
        if (res.success) {
          setGroups(res.groups || [])
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

  // 解析链接 href → 绝对路径（相对当前笔记目录）
  const resolveHref = useCallback(
    (href: string): string | null => {
      if (!rootDir) return null
      if (href.startsWith('file://')) return decodeURIComponent(href.slice(7))
      if (href.startsWith('/') || /^[a-zA-Z]:/.test(href)) return href
      if (!currentPath) return null
      const base = currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
      // 标准化：去 ./ 和 ../
      const parts = (base + href).split('/')
      const stack: string[] = []
      for (const p of parts) {
        if (p === '..') stack.pop()
        else if (p === '.' || p === '') continue
        else stack.push(p)
      }
      const abs = stack.join('/')
      return abs.replace(/\\/g, '/')
    },
    [rootDir, currentPath],
  )

  // 悬停链接 → 延迟 300ms 后加载预览
  const handleLinkHover = useCallback(
    (href: string, el: HTMLElement) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      const abs = resolveHref(href)
      if (!abs) return
      const rect = el.getBoundingClientRect()
      hoverTimerRef.current = setTimeout(() => {
        window.electronAPI.readNote(abs).then(res => {
          if (res.success && res.content) {
            const name = res.filename?.replace(/\.md$/i, '') || ''
            setPreview({
              content: res.content,
              name,
              x: rect.left,
              y: rect.bottom + 8,
            })
          } else {
            setPreview({ content: '', name: '', x: rect.left, y: rect.bottom + 8 })
          }
        })
      }, 300)
    },
    [resolveHref],
  )

  const handleLinkLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    // 延迟关闭，允许鼠标移入预览浮层
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => setPreview(null), 250)
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
    <div className="notes-panel">
      {/* 左侧文件列表 */}
      <div className="notes-panel__files">
        <div className="notes-panel__files-title">
          <FolderOpen size={13} />
          {t('笔记库')}
        </div>
        <div className="notes-panel__files-scroll">
          {groups.map(group => {
            const isCollapsed = collapsed.has(group.dir)
            return (
              <div key={group.dir} className="notes-panel__group">
                <button className="notes-panel__group-btn" onClick={() => toggleGroup(group.dir)}>
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="notes-panel__group-name">{group.dir}</span>
                  <span className="notes-panel__group-count">{group.files.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="notes-panel__group-files">
                    {group.files.map(file => (
                      <motion.button
                        key={file.path}
                        className={`notes-panel__file ${currentPath === file.path ? 'is-active' : ''}`}
                        onClick={() => openNote(file.path, file.name)}
                        whileTap={{ scale: 0.98 }}
                        title={file.relPath}
                      >
                        <FileText size={12} />
                        <span className="notes-panel__file-name">{file.name}</span>
                      </motion.button>
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
              <span className="notes-panel__reader-title" title={currentPath}>
                {currentName}
              </span>
              <span className="notes-panel__reader-path">{currentPath.replace(rootDir || '', '')}</span>
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

      {/* 悬停预览浮层 */}
      {preview && (
        <div
          className="notes-preview-pop"
          style={{ left: Math.min(preview.x, window.innerWidth - 340), top: preview.y }}
          onMouseEnter={() => {
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
          }}
          onMouseLeave={() => setPreview(null)}
        >
          {preview.name ? (
            <>
              <div className="notes-preview-pop__title">{preview.name}</div>
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
            </>
          ) : (
            <div className="notes-preview-pop__empty">{t('笔记不存在')}</div>
          )}
        </div>
      )}
    </div>
  )
}
