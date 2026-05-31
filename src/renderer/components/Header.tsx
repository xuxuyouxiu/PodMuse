import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import { Minus, Square, X, Sun, Moon, Search } from 'lucide-react'
import { FeishuStatus } from '@shared/types'
import StatusBar from './StatusBar'

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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [version, setVersion] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMinimize = () => (window as any).electronAPI?.minimizeWindow?.()
  const handleMaximize = () => (window as any).electronAPI?.maximizeWindow?.()
  const handleClose = () => (window as any).electronAPI?.closeWindow?.()

  // 获取应用版本号
  useEffect(() => {
    window.electronAPI.getAppVersion().then(v => setVersion(v)).catch(() => {})
  }, [])

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

  const typeColors: Record<string, string> = {
    '人物': 'var(--accent-purple, #a78bfa)',
    '项目': 'var(--accent-blue, #60a5fa)',
    '概念': 'var(--accent-green, #34d399)',
    '术语': 'var(--accent-orange, #fbbf24)',
    '笔记': 'var(--text-muted)',
  }

  return (
    <div className="workspace-topbar" style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      minHeight: 42,
      padding: '8px 16px',
      WebkitAppRegion: 'drag',
      userSelect: 'none',
      borderBottom: '1px solid var(--border)',
      gap: 10,
      flexShrink: 0,
      backdropFilter: 'blur(20px)',
      background: 'var(--bg-panel)',
    } as React.CSSProperties}>
      <div className="workspace-topbar__content" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        flex: 1,
      }}>
        <img
          src="./icon.png"
          alt="播客笔记助手"
          style={{
            width: 22, height: 22,
            borderRadius: 6,
            flexShrink: 0,
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
          播客笔记助手
          {version && (
            <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>v{version}</span>
          )}
        </span>
        <div
          ref={wrapRef}
          className="workspace-topbar__search-wrap"
          style={{
            marginLeft: 18,
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitAppRegion: 'no-drag',
            position: 'relative',
          } as React.CSSProperties}
        >
          <div className="workspace-topbar__search" style={{
            width: 'min(460px, 100%)',
            height: 34,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderRadius: 12,
            border: `1px solid ${open ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
            background: 'color-mix(in srgb, var(--bg-elevated) 86%, transparent)',
            color: 'var(--text-muted)',
            fontSize: 12,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: open ? '0 0 0 2px var(--accent-glow)' : 'none',
          }}>
            <Search size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleChange(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="搜索笔记、播客、关键词..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
            {!query && (
              <kbd style={{
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontFamily: 'inherit',
                flexShrink: 0,
              }}>
                Ctrl + K
              </kbd>
            )}
          </div>

          {/* 搜索结果下拉 */}
          {open && (query.trim() || results.length > 0) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(460px, 100%)',
              marginTop: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-lg)',
              maxHeight: 360,
              overflowY: 'auto',
              zIndex: 100,
              animation: 'fadeIn 0.15s ease',
            }}>
              {loading && (
                <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  搜索中...
                </div>
              )}
              {!loading && query.trim() && results.length === 0 && (
                <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  未找到匹配结果
                </div>
              )}
              {!loading && results.map((r, i) => (
                <div
                  key={r.path}
                  onClick={() => handleOpen(r.path)}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: i === selectedIndex ? 'var(--bg-card)' : 'transparent',
                    borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: `${typeColors[r.type] || 'var(--text-muted)'}20`,
                      color: typeColors[r.type] || 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {r.type}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                  </div>
                  {r.excerpt && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.excerpt}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="workspace-topbar__actions" style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <StatusBar status={status} />
          <button onClick={onToggleTheme} style={themeBtn}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
        </div>
      </div>
      <div className="workspace-topbar__window-controls" style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={handleMinimize} style={tbBtn}><Minus size={14} /></button>
        <button onClick={handleMaximize} style={tbBtn}><Square size={14} /></button>
        <button onClick={handleClose} style={tbBtn}><X size={14} /></button>
      </div>
    </div>
  )
}

const tbBtn: React.CSSProperties = {
  width: 28, height: 28,
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
}

const themeBtn: React.CSSProperties = {
  height: 32,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  transition: 'all 0.15s',
}
