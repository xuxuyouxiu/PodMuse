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
import { useI18n } from '../../i18n'

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
  const { t } = useI18n()
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
        <span className="st-status st-status--muted">
          <Clock size={13} /> {t('敬请期待')}
        </span>
      )
    }

    if (row.depType === 'yt-dlp') {
      if (!ytDlp) {
        return <span className="st-status st-status--muted">{t('检测中...')}</span>
      }
      if (ytDlp.available && !ytDlp.outdated) {
        return (
          <span className="st-status st-status--success">
            <Check size={13} /> {t('可用')}
            <span className="st-version">yt-dlp {ytDlp.version}</span>
          </span>
        )
      }
      if (ytDlp.available && ytDlp.outdated) {
        return (
          <span className="st-status st-status--warning">
            <AlertTriangle size={13} /> {t('版本过旧')}
            <span className="st-version">{ytDlp.version}</span>
          </span>
        )
      }
      return (
        <span className="st-status st-status--error">
          <AlertTriangle size={13} /> {t('需安装 yt-dlp')}
          <button
            onClick={() =>
              window.electronAPI.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest')
            }
            className="st-link-underline"
          >
            {t('安装指南')} <ExternalLink size={11} />
          </button>
        </span>
      )
    }

    // depType === 'ready'
    return (
      <span className="st-status st-status--success">
        <Check size={13} /> {t('可用')}
      </span>
    )
  }

  return (
    <div>
      <TabHeader title={t('支持平台')} subtitle={t('查看各平台的支持状态和外部依赖')} />

      <div className="st-stack">
        {PLATFORMS.map(row => {
          const Icon = row.icon
          return (
            <div key={row.id} className="st-platform-row">
              <div className="st-platform-main">
                <Icon size={16} className="st-platform-icon" />
                <div>
                  <div className="st-platform-name">{t(row.name)}</div>
                  <div className="st-platform-url">{t(row.urlExample)}</div>
                </div>
              </div>
              <div className="st-no-shrink st-ml-12">{getStatusBadge(row)}</div>
            </div>
          )
        })}
      </div>

      {/* 即将支持 */}
      <div className="st-mt-20">
        <div className="st-section-label">{t('即将支持')}</div>
        <div className="st-stack">
          {COMING_SOON.map(p => {
            const Icon = p.icon
            return (
              <div key={p.name} className="st-platform-row st-platform-row--dim">
                <div className="st-platform-main">
                  <Icon size={16} className="st-platform-icon--muted" />
                  <div className="st-platform-name st-platform-name--muted">{t(p.name)}</div>
                </div>
                <span className="st-status st-status--muted">
                  <Clock size={13} /> {t('敬请期待')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 重新检测按钮 */}
      <div className="st-mt-16">
        <button onClick={recheckYtDlp} disabled={checking} className="st-ghost-btn">
          {checking ? t('检测中...') : t('重新检测 yt-dlp')}
        </button>
      </div>
    </div>
  )
}
