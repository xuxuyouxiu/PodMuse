import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Loader2, Rss, ExternalLink } from 'lucide-react'
import { useI18n } from '../../i18n'

interface SubInfo {
  sub: {
    id: string
    name: string
    url: string
    autoProcess: boolean
    enabled: boolean
    createdAt: number
    processedCount: number
  }
  lastCheckAt: number | null
  newEpisodes: { key: string; title: string; link: string; pubDate?: string }[]
}

/**
 * 订阅管理 — RSS 源管理 + 定时检查 + 自动/手动处理策略
 */
export default function TabSubscription() {
  const { t } = useI18n()
  const [infos, setInfos] = useState<SubInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    window.electronAPI
      .listSubscriptions()
      .then(data => setInfos(data || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const off = window.electronAPI.onSubscriptionUpdate(data => setInfos(data || []))
    return () => off()
  }, [load])

  const handleAdd = async () => {
    if (!name.trim() || !url.trim() || adding) return
    setAdding(true)
    setAddError('')
    try {
      const res = await window.electronAPI.addSubscription(name, url)
      if (!res.success) {
        setAddError(res.error || t('添加失败'))
      } else {
        setName('')
        setUrl('')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: string) => {
    await window.electronAPI.removeSubscription(id)
  }

  const handleToggle = (id: string, patch: Record<string, unknown>) => {
    window.electronAPI.updateSubscription(id, patch)
  }

  const handleCheck = async (id?: string) => {
    if (checking) return
    setChecking(true)
    try {
      await window.electronAPI.checkSubscriptions(id)
    } finally {
      setChecking(false)
    }
  }

  const handleEnqueueSelected = (subId: string) => {
    const sub = infos.find(i => i.sub.id === subId)
    if (!sub) return
    const keys = sub.newEpisodes.filter(ep => selected[ep.key]).map(ep => ep.key)
    if (keys.length === 0) return
    const queue = keys
      .map(k => sub.newEpisodes.find(ep => ep.key === k)?.link)
      .filter((l): l is string => Boolean(l))
    if (queue.length > 0) {
      window.electronAPI
        .batchAdd(queue.map(link => ({ source: link, type: 'url' as const })))
        .then(() => window.electronAPI.markSubscriptionSeen(subId, keys))
        .catch(() => {})
    }
  }

  return (
    <div className="sub-tab">
      {/* 添加订阅 */}
      <div className="sub-tab__add">
        <div className="sub-tab__add-fields">
          <input
            className="sub-tab__input"
            placeholder={t('订阅名称（如：科技早知道）')}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="sub-tab__input"
            placeholder={t('RSS 地址（https://...）')}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <button className="sub-tab__add-btn" onClick={handleAdd} disabled={adding || !name.trim() || !url.trim()}>
          {adding ? <Loader2 size={13} className="note-preview__spin" /> : <Plus size={13} />}
          {t('添加订阅')}
        </button>
      </div>
      {addError && <div className="sub-tab__error">{addError}</div>}

      {/* 订阅列表 */}
      {loading ? (
        <div className="sub-tab__status">
          <Loader2 size={16} className="note-preview__spin" />
          {t('加载中...')}
        </div>
      ) : infos.length === 0 ? (
        <div className="sub-tab__empty">
          <Rss size={26} />
          <div>{t('还没有订阅')}</div>
          <div className="sub-tab__empty-hint">
            {t('粘贴播客的 RSS 地址即可自动跟踪更新。小宇宙/Apple Podcasts 均提供 RSS；YouTube 频道 RSS 格式为 https://www.youtube.com/feeds/videos.xml?channel_id=频道ID')}
          </div>
        </div>
      ) : (
        <div className="sub-tab__list">
          <div className="sub-tab__list-header">
            <button
              className="sub-tab__check-all"
              onClick={() => handleCheck()}
              disabled={checking}
            >
              {checking ? <Loader2 size={12} className="note-preview__spin" /> : <RefreshCw size={12} />}
              {t('立即检查全部')}
            </button>
          </div>
          {infos.map(info => (
            <div key={info.sub.id} className="sub-card">
              <div className="sub-card__head">
                <div className="sub-card__title-wrap">
                  <span className="sub-card__name">{info.sub.name}</span>
                  <span
                    className={`sub-card__badge ${info.sub.autoProcess ? 'sub-card__badge--auto' : 'sub-card__badge--manual'}`}
                  >
                    {info.sub.autoProcess ? t('自动') : t('手动')}
                  </span>
                  {!info.sub.enabled && <span className="sub-card__badge sub-card__badge--off">{t('已停用')}</span>}
                </div>
                <div className="sub-card__actions">
                  <button
                    className="sub-card__icon-btn"
                    onClick={() => handleCheck(info.sub.id)}
                    disabled={checking}
                    title={t('立即检查')}
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    className="sub-card__icon-btn sub-card__icon-btn--danger"
                    onClick={() => handleRemove(info.sub.id)}
                    title={t('删除订阅')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="sub-card__meta">
                <span>{t('上次检查')}: {info.lastCheckAt ? new Date(info.lastCheckAt).toLocaleString() : t('从未')}</span>
                <span>{t('累计处理')}: {info.sub.processedCount}</span>
              </div>

              {/* 开关行 */}
              <div className="sub-card__toggles">
                <label className="sub-card__toggle">
                  <span>{t('新节目自动处理')}</span>
                  <input
                    type="checkbox"
                    checked={info.sub.autoProcess}
                    onChange={e => handleToggle(info.sub.id, { autoProcess: e.target.checked })}
                  />
                </label>
                <label className="sub-card__toggle">
                  <span>{t('启用')}</span>
                  <input
                    type="checkbox"
                    checked={info.sub.enabled}
                    onChange={e => handleToggle(info.sub.id, { enabled: e.target.checked })}
                  />
                </label>
              </div>

              {/* 新节目（手动源待处理） */}
              {info.newEpisodes.length > 0 && (
                <div className="sub-card__episodes">
                  <div className="sub-card__episodes-title">
                    {t('新节目')} ({info.newEpisodes.length})
                    {!info.sub.autoProcess && (
                      <button
                        className="sub-card__enqueue-btn"
                        onClick={() => handleEnqueueSelected(info.sub.id)}
                      >
                        {t('将选中加入队列')}
                      </button>
                    )}
                  </div>
                  {info.newEpisodes.map(ep => (
                    <div key={ep.key} className="sub-card__episode">
                      {!info.sub.autoProcess && (
                        <input
                          type="checkbox"
                          checked={!!selected[ep.key]}
                          onChange={e =>
                            setSelected(prev => ({ ...prev, [ep.key]: e.target.checked }))
                          }
                        />
                      )}
                      <span className="sub-card__episode-title" title={ep.title}>{ep.title}</span>
                      <a
                        className="sub-card__episode-link"
                        href={ep.link}
                        onClick={e => {
                          e.preventDefault()
                          window.electronAPI.openExternal(ep.link)
                        }}
                        title={t('打开原链接')}
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
