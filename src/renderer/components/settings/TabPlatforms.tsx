import { useState, useEffect } from 'react'
import {
  Radio,
  MonitorPlay,
  PlayCircle,
  Headphones,
  Podcast,
  Music,
  Check,
  AlertTriangle,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { TabHeader } from './FieldComponents'

interface PlatformRow {
  id: string
  name: string
  icon: typeof Radio
  /** 'ready' = no deps needed, 'yt-dlp' = needs yt-dlp, 'coming' = not yet supported */
  depType: 'ready' | 'yt-dlp' | 'coming'
  urlExample: string
}

const PLATFORMS: PlatformRow[] = [
  {
    id: 'xiaoyuzhou',
    name: '小宇宙',
    icon: Radio,
    depType: 'ready',
    urlExample: 'xiaoyuzhoufm.com/episode/...',
  },
  {
    id: 'bilibili',
    name: 'B 站',
    icon: MonitorPlay,
    depType: 'ready',
    urlExample: 'bilibili.com/video/BV...',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: PlayCircle,
    depType: 'yt-dlp',
    urlExample: 'youtube.com/watch?v=...',
  },
  {
    id: 'ximalaya',
    name: '喜马拉雅',
    icon: Headphones,
    depType: 'ready',
    urlExample: 'ximalaya.com/sound/...',
  },
  {
    id: 'apple-podcasts',
    name: 'Apple Podcasts',
    icon: Podcast,
    depType: 'ready',
    urlExample: 'podcasts.apple.com/...',
  },
  {
    id: 'direct-url',
    name: '直链音频',
    icon: Music,
    depType: 'ready',
    urlExample: '任意 .mp3/.m4a/.mp4 URL',
  },
]

const COMING_SOON = [
  { name: 'Spotify', icon: Music },
  { name: '网易云音乐', icon: Music },
]

export default function TabPlatforms() {
  const [ytDlp, setYtDlp] = useState<YtDlpStatus | null>(null)
  const [checking, setChecking] = useState(false)

  // 组件挂载时获取 yt-dlp 状态
  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .detectYtDlp()
      .then(status => {
        if (!cancelled) setYtDlp(status)
      })
      .catch(() => {
        if (!cancelled) setYtDlp({ available: false, path: null, version: null, outdated: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function recheckYtDlp() {
    setChecking(true)
    try {
      const status = await window.electronAPI.detectYtDlp()
      setYtDlp(status)
    } catch {
      setYtDlp({ available: false, path: null, version: null, outdated: false })
    } finally {
      setChecking(false)
    }
  }

  function getStatusBadge(row: PlatformRow) {
    if (row.depType === 'coming') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <Clock size={13} /> 敬请期待
        </span>
      )
    }

    if (row.depType === 'yt-dlp') {
      if (!ytDlp) {
        return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>检测中...</span>
      }
      if (ytDlp.available && !ytDlp.outdated) {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--success)',
            }}
          >
            <Check size={13} /> 可用
            <span
              style={{
                color: 'var(--text-muted)',
                marginLeft: 4,
                fontFamily: 'Consolas, monospace',
                fontSize: 11,
              }}
            >
              yt-dlp {ytDlp.version}
            </span>
          </span>
        )
      }
      if (ytDlp.available && ytDlp.outdated) {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--warning, #e6a817)',
            }}
          >
            <AlertTriangle size={13} /> 版本过旧
            <span
              style={{
                color: 'var(--text-muted)',
                marginLeft: 4,
                fontFamily: 'Consolas, monospace',
                fontSize: 11,
              }}
            >
              {ytDlp.version}
            </span>
          </span>
        )
      }
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--error)',
          }}
        >
          <AlertTriangle size={13} /> 需安装 yt-dlp
          <button
            onClick={() =>
              window.electronAPI.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest')
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            安装指南 <ExternalLink size={11} />
          </button>
        </span>
      )
    }

    // depType === 'ready'
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: 'var(--success)',
        }}
      >
        <Check size={13} /> 可用
      </span>
    )
  }

  return (
    <div>
      <TabHeader title="支持平台" subtitle="查看各平台的支持状态和外部依赖" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {PLATFORMS.map(row => {
          const Icon = row.icon
          return (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Icon size={16} style={{ color: 'var(--accent)', opacity: 0.8, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {row.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: 'Consolas, monospace',
                    }}
                  >
                    {row.urlExample}
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, marginLeft: 12 }}>{getStatusBadge(row)}</div>
            </div>
          )
        })}
      </div>

      {/* 即将支持 */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          即将支持
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {COMING_SOON.map(p => {
            const Icon = p.icon
            return (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  opacity: 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.name}</div>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Clock size={13} /> 敬请期待
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 重新检测按钮 */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={recheckYtDlp}
          disabled={checking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            cursor: checking ? 'default' : 'pointer',
            fontSize: 12,
            opacity: checking ? 0.6 : 1,
          }}
        >
          {checking ? '检测中...' : '重新检测 yt-dlp'}
        </button>
      </div>
    </div>
  )
}
