import { FeishuStatus } from '../../../shared/types'
import StatusBar from './StatusBar'

interface HeaderProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: FeishuStatus
}

export default function Header({ theme, onToggleTheme, status }: HeaderProps) {
  const handleMinimize = () => (window as any).electronAPI?.minimizeWindow?.()
  const handleMaximize = () => (window as any).electronAPI?.maximizeWindow?.()
  const handleClose = () => (window as any).electronAPI?.closeWindow?.()

  return (
    <div className="workspace-topbar" style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      minHeight: 42,
      padding: '8px 16px',
      WebkitAppRegion: 'drag' as any,
      userSelect: 'none',
      borderBottom: '1px solid var(--border)',
      gap: 10,
      flexShrink: 0,
    }}>
      <div className="workspace-topbar__content" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        flex: 1,
      }}>
        <div style={{
          width: 22, height: 22,
          borderRadius: 6,
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: '#fff',
          flexShrink: 0,
          boxShadow: '0 0 12px var(--accent-glow)',
        }}>
          🎧
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
          播客笔记助手
        </span>
        <div
          className="workspace-topbar__search-wrap"
          aria-hidden="true"
          style={{
            marginLeft: 18,
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitAppRegion: 'no-drag' as any,
          }}
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
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--bg-elevated) 86%, transparent)',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              搜索笔记、播客、关键词...
            </span>
            <kbd style={{
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontFamily: 'inherit',
            }}>
              Ctrl + K
            </kbd>
          </div>
        </div>
        <div className="workspace-topbar__actions" style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', WebkitAppRegion: 'no-drag' as any }}>
          <StatusBar status={status} />
          <button onClick={onToggleTheme} style={themeBtn}>
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
        </div>
      </div>
      <div className="workspace-topbar__window-controls" style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
        <button onClick={handleMinimize} style={tbBtn}>─</button>
        <button onClick={handleMaximize} style={tbBtn}>□</button>
        <button onClick={handleClose} style={{ ...tbBtn, close: true }}>✕</button>
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
  transition: 'all 0.15s',
}
