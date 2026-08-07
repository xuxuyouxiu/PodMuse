import { useState, useEffect, useRef, useCallback } from 'react'
import { Minus, Square, X, Sun, Moon, Search, Languages } from 'lucide-react'
import { FeishuStatus } from '@shared/types'
import StatusBar from './StatusBar'
import { useI18n } from '../i18n'

interface SearchResult {
  path: string
  name: string
  excerpt: string
  type: string
}

interface HeaderProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: FeishuStatus
}

export default function Header({ theme, onToggleTheme, status }: HeaderProps) {
  const { lang, setLang, t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMinimize = () => window.electronAPI?.minimizeWindow?.()
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.()
  const handleClose = () => window.electronAPI?.closeWindow?.()

  // Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 防抖搜索
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await window.electronAPI.searchNotes(keyword)
      setResults(res)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    setSelectedIndex(-1)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(value), 250)
  }

  const handleOpen = async (path: string) => {
    await window.electronAPI.openPath(path)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault()
      handleOpen(results[selectedIndex].path)
    }
  }

  const typeBadgeClass: Record<string, string> = {
    人物: 'type-person',
    项目: 'type-project',
    概念: 'type-concept',
    术语: 'type-term',
    笔记: 'type-note',
  }

  return (
    <div
      className="workspace-topbar topbar-root"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="workspace-topbar__content">
        <div
          ref={wrapRef}
          className="workspace-topbar__search-wrap"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div
            className={`topbar-search-box${focused ? ' is-focused' : ''}`}
            onClick={() => inputRef.current?.focus()}
          >
            <Search size={14} className="topbar-search-icon" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleChange(e.target.value)}
              onFocus={() => {
                setFocused(true)
                setOpen(true)
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={t("搜索笔记、播客、关键词...")}
              className="topbar-search-input"
            />
            {query && (
              <button
                className="topbar-search-clear"
                onClick={e => {
                  e.stopPropagation()
                  setQuery('')
                  setResults([])
                  inputRef.current?.focus()
                }}
                aria-label={t("清除搜索")}
              >
                <X size={11} />
              </button>
            )}
            {!query && <kbd className="topbar-kbd">Ctrl + K</kbd>}
          </div>

          {/* 搜索结果下拉 */}
          {open && (query.trim() || results.length > 0) && (
            <div className="topbar-dropdown">
              {loading && <div className="topbar-status-msg">{t("搜索中...")}</div>}
              {!loading && query.trim() && results.length === 0 && (
                <div className="topbar-status-msg">{t("未找到匹配结果")}</div>
              )}
              {!loading &&
                results.map((r, i) => (
                  <div
                    key={r.path}
                    onClick={() => handleOpen(r.path)}
                    className={`topbar-result-item${i === selectedIndex ? ' is-selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <div className="topbar-result-head">
                      <span
                        className={`topbar-type-badge ${typeBadgeClass[r.type] || 'type-note'}`}
                      >
                        {r.type}
                      </span>
                      <span className="topbar-result-name">{r.name}</span>
                    </div>
                    {r.excerpt && <div className="topbar-result-excerpt">{r.excerpt}</div>}
                  </div>
                ))}
            </div>
          )}
        </div>
        {/* 可拖动空白区（小窗口时也能舒适拖动） */}
        <div className="topbar-drag-spacer" />
        <div
          className="workspace-topbar__actions"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <StatusBar status={status} />
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="topbar-theme-btn"
            title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages size={14} />
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <button onClick={onToggleTheme} className="topbar-theme-btn">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? t('浅色') : t('深色')}
          </button>
        </div>
      </div>
      <div
        className="workspace-topbar__window-controls"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button onClick={handleMinimize} className="topbar-winctl-btn" aria-label={t("最小化")}>
          <Minus size={14} />
        </button>
        <button onClick={handleMaximize} className="topbar-winctl-btn" aria-label={t("最大化")}>
          <Square size={14} />
        </button>
        <button onClick={handleClose} className="topbar-winctl-btn" aria-label={t("关闭")}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
