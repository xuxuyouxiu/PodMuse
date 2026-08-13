import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Rss,
  ExternalLink,
  Search,
  Upload,
  HelpCircle,
  Check,
  Settings,
  ChevronDown,
  Radio,
  Headphones,
  Podcast,
} from 'lucide-react'
import { useI18n } from '../i18n'

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

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim())

/** 推荐订阅平台分组 */
const REC_GROUPS = [
  { key: 'xiaoyuzhou', label: '小宇宙', icon: Radio },
  { key: 'ximalaya', label: '喜马拉雅', icon: Headphones },
  { key: 'apple', label: 'Apple Podcasts', icon: Podcast },
] as const

/**
 * 订阅视图（侧边栏一级入口）— 智能输入 + 搜索订阅 + 链接解析 + 推荐 + OPML 导入 + 订阅管理
 */
export default function SubscriptionView() {
  const { t } = useI18n()
  const [infos, setInfos] = useState<SubInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchResults, setSearchResults] = useState<PodcastSearchResult[] | null>(null)
  const [resolved, setResolved] = useState<ResolvedFeed | null>(null)
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [recommended, setRecommended] = useState<RecommendedPodcast[]>([])
  const [recommendedLoaded, setRecommendedLoaded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [opmlPreview, setOpmlPreview] = useState<OpmlEntry[] | null>(null)
  const [opmlSelected, setOpmlSelected] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [checkInterval, setCheckInterval] = useState(6)
  const [rsshubBase, setRsshubBase] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  const load = useCallback(() => {
    window.electronAPI
      .listSubscriptions()
      .then(data => setInfos(data || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const off = window.electronAPI.onSubscriptionUpdate(data => setInfos(data || []))
    window.electronAPI
      .getRecommendedPodcasts()
      .then(data => {
        setRecommended(data || [])
        setRecommendedLoaded(true)
      })
      .catch(() => setRecommendedLoaded(true))
    window.electronAPI
      .getConfig()
      .then(cfg => {
        if (cfg) {
          setCheckInterval(cfg.subscription_check_interval_hours || 6)
          setRsshubBase(cfg.rsshub_base_url || 'https://rsshub.rssforever.com')
        }
      })
      .catch(() => {})
    return () => off()
  }, [load])

  const flashNotice = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3000)
  }

  // ---- 智能输入：URL → 解析，文本 → 搜索 ----
  const handleSmartInput = async () => {
    const value = input.trim()
    if (!value || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    setSearchResults(null)
    setResolved(null)
    try {
      if (isUrl(value)) {
        const feed = await window.electronAPI.resolveFeed(value)
        if (!feed) {
          setError(t('无法解析该链接，可在下方手动添加 RSS 或查看帮助'))
        } else {
          setResolved(feed)
        }
      } else {
        const results = await window.electronAPI.searchPodcasts(value)
        setSearchResults(results)
        if (results.length === 0) {
          setError(t('未找到相关播客，可尝试粘贴播客链接或换个关键词'))
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleSubscribe = async (name: string, url: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await window.electronAPI.addSubscription(name, url)
      if (!res.success) {
        setError(res.error || t('添加失败'))
      } else {
        flashNotice(`${t('已订阅')}：${name}`)
        setInput('')
        setResolved(null)
        load()
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- OPML 导入 ----
  const handlePickOpml = async () => {
    try {
      const filePath = await window.electronAPI.selectFile()
      if (!filePath) return
      const entries = await window.electronAPI.parseOpmlFile(filePath)
      if (entries.length === 0) {
        setError(t('OPML 文件中未找到 RSS 订阅源'))
        return
      }
      setOpmlPreview(entries)
      setOpmlSelected(Object.fromEntries(entries.map((e, i) => [`${i}-${e.url}`, true])))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }

  const handleConfirmImport = async () => {
    if (!opmlPreview || importing) return
    setImporting(true)
    setError('')
    let ok = 0
    let failed = 0
    const failedNames: string[] = []
    for (let i = 0; i < opmlPreview.length; i++) {
      const entry = opmlPreview[i]
      if (!opmlSelected[`${i}-${entry.url}`]) continue
      try {
        const res = await window.electronAPI.addSubscription(entry.name, entry.url)
        if (res.success) ok++
        else {
          failed++
          failedNames.push(entry.name)
        }
      } catch {
        failed++
        failedNames.push(entry.name)
      }
    }
    setOpmlPreview(null)
    setImporting(false)
    flashNotice(`${t('导入完成')}：${t('成功')} ${ok}，${t('失败')} ${failed}`)
    if (failed > 0) setError(`${t('以下源导入失败')}：${failedNames.slice(0, 5).join('、')}`)
    load()
  }

  // ---- 订阅设置（检查间隔 + RSSHub 地址） ----
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const cfg = await window.electronAPI.getConfig()
      if (cfg) {
        const hours = Math.max(1, Math.min(24, Number(checkInterval) || 6))
        await window.electronAPI.saveConfig({
          ...cfg,
          subscription_check_interval_hours: hours,
          rsshub_base_url: rsshubBase.trim() || 'https://rsshub.rssforever.com',
        })
        setCheckInterval(hours)
        flashNotice(t('保存成功'))
      }
    } catch {
      setError(t('保存失败'))
    } finally {
      setSavingSettings(false)
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

  const handleManualAdd = async () => {
    if (!manualName.trim() || !manualUrl.trim() || busy) return
    const res = await window.electronAPI.addSubscription(manualName, manualUrl)
    if (!res.success) {
      setError(res.error || t('添加失败'))
    } else {
      flashNotice(`${t('已订阅')}：${manualName}`)
      setManualName('')
      setManualUrl('')
      setManualOpen(false)
      load()
    }
  }

  const subscribedFeeds = new Set(infos.map(i => i.sub.url))

  return (
    <div className="sub-view">
      <div className="sub-view__head">
        <h2 className="sub-view__title">
          <Rss size={18} />
          {t('订阅')}
        </h2>
        <div className="sub-view__head-actions">
          <button className="sub-view__tool-btn" onClick={handlePickOpml} title={t('从其他播客 App 导入 OPML')}>
            <Upload size={13} />
            {t('导入 OPML')}
          </button>
          <button className="sub-view__tool-btn" onClick={() => setHelpOpen(v => !v)} title={t('帮助')}>
            <HelpCircle size={13} />
            {t('帮助')}
          </button>
        </div>
      </div>

      {/* 智能输入框 */}
      <div className="sub-view__smart">
        <div className="sub-view__input-wrap">
          <Search size={14} className="sub-view__input-icon" />
          <input
            className="sub-view__input"
            placeholder={t('输入播客名或粘贴链接')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSmartInput()}
          />
          <button className="sub-view__input-btn" onClick={handleSmartInput} disabled={busy || !input.trim()}>
            {busy ? <Loader2 size={13} className="note-preview__spin" /> : <Search size={13} />}
          </button>
        </div>
      </div>

      {error && <div className="sub-view__error">{error}</div>}
      {notice && <div className="sub-view__notice">{notice}</div>}

      {/* 帮助折叠 */}
      {helpOpen && (
        <div className="sub-view__help">
          <div className="sub-view__help-title">{t('如何获取 RSS 地址（各平台）')}</div>
          <ul>
            <li>{t('小宇宙：粘贴播客主页链接即可自动转换')}</li>
            <li>{t('Apple Podcasts：粘贴播客详情页链接即可自动解析')}</li>
            <li>{t('喜马拉雅：粘贴专辑页链接即可自动转换')}</li>
            <li>{t('YouTube：粘贴频道主页链接即可订阅更新')}</li>
            <li>{t('博客/网站：粘贴首页链接，将自动发现 RSS')}</li>
          </ul>
        </div>
      )}

      {/* 链接解析预览 */}
      {resolved && !busy && (
        <div className="sub-view__preview">
          <div className="sub-view__preview-info">
            {resolved.artwork && <img className="sub-view__artwork" src={resolved.artwork} alt="" />}
            <div>
              <div className="sub-view__preview-title">{resolved.title || t('已识别播客源')}</div>
              {resolved.author && <div className="sub-view__preview-author">{resolved.author}</div>}
              {resolved.candidates && resolved.candidates.length > 1 && (
                <div className="sub-view__candidates">
                  <div className="sub-view__candidates-title">{t('发现多个源，请选择')}：</div>
                  {resolved.candidates.map(c => (
                    <button
                      key={c.url}
                      className="sub-view__candidate"
                      onClick={() => setResolved({ feedUrl: c.url, title: c.title })}
                    >
                      {c.title || c.url}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            className="sub-view__confirm-btn"
            disabled={busy || subscribedFeeds.has(resolved.feedUrl)}
            onClick={() => handleSubscribe(resolved.title || resolved.feedUrl, resolved.feedUrl)}
          >
            {subscribedFeeds.has(resolved.feedUrl) ? <Check size={13} /> : <Plus size={13} />}
            {subscribedFeeds.has(resolved.feedUrl) ? t('已订阅') : t('确认添加')}
          </button>
        </div>
      )}

      {/* 搜索结果 */}
      {searchResults && searchResults.length > 0 && !resolved && (
        <div className="sub-view__results">
          {searchResults.map(r => {
            const subscribed = subscribedFeeds.has(r.feedUrl)
            return (
              <div key={r.feedUrl} className="sub-view__result-card">
                {r.artwork ? (
                  <img className="sub-view__artwork" src={r.artwork} alt="" />
                ) : (
                  <div className="sub-view__artwork sub-view__artwork--placeholder">
                    <Rss size={18} />
                  </div>
                )}
                <div className="sub-view__result-info">
                  <div className="sub-view__result-title">{r.title}</div>
                  <div className="sub-view__result-author">{r.author}</div>
                </div>
                <button
                  className="sub-view__confirm-btn"
                  disabled={busy || subscribed}
                  onClick={() => handleSubscribe(r.title, r.feedUrl)}
                >
                  {subscribed ? <Check size={13} /> : <Plus size={13} />}
                  {subscribed ? t('已订阅') : t('订阅')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 推荐订阅（按平台模块化：折叠时横向卡片行预览，点击展开全部） */}
      {!loading && !searchResults && !resolved && recommendedLoaded && recommended.length > 0 && (
        <div className="sub-view__recommended">
          <div className="sub-view__section-title">{t('推荐订阅')}</div>
          {REC_GROUPS.map(g => {
            const items = recommended.filter(r => r.platform === g.key)
            if (items.length === 0) return null
            const expanded = !!expandedGroups[g.key]
            return (
              <div key={g.key} className="sub-view__rec-group">
                <button
                  type="button"
                  className="sub-view__rec-group-title"
                  onClick={() => setExpandedGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                >
                  <ChevronDown
                    size={14}
                    className={`sub-view__rec-group-chevron ${expanded ? 'sub-view__rec-group-chevron--open' : ''}`}
                  />
                  <g.icon size={14} />
                  {t(g.label)}
                  <span className="sub-view__rec-group-count">{items.length}</span>
                </button>
                {expanded ? (
                  <div className="sub-view__recommended-grid">
                    {items.map(r => {
                      const subscribed = subscribedFeeds.has(r.feedUrl)
                      return (
                        <div key={r.feedUrl} className="sub-view__rec-card">
                          {r.artwork ? (
                            <img className="sub-view__rec-artwork" src={r.artwork} alt="" />
                          ) : (
                            <div className="sub-view__rec-artwork sub-view__artwork--placeholder">
                              <Rss size={20} />
                            </div>
                          )}
                          <div className="sub-view__rec-info">
                            <div className="sub-view__rec-title" title={r.name}>{r.name}</div>
                            <div className="sub-view__rec-desc">{r.description}</div>
                          </div>
                          <button
                            className="sub-view__confirm-btn"
                            disabled={busy || subscribed}
                            onClick={() => handleSubscribe(r.name, r.feedUrl)}
                          >
                            {subscribed ? <Check size={13} /> : <Plus size={13} />}
                            {subscribed ? t('已订阅') : t('订阅')}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="sub-view__rec-row">
                    {items.slice(0, 6).map(r => {
                      const subscribed = subscribedFeeds.has(r.feedUrl)
                      return (
                        <div key={r.feedUrl} className="sub-view__rec-mini">
                          {r.artwork ? (
                            <img className="sub-view__rec-mini-artwork" src={r.artwork} alt="" />
                          ) : (
                            <div className="sub-view__rec-mini-artwork sub-view__artwork--placeholder">
                              <Rss size={16} />
                            </div>
                          )}
                          <div className="sub-view__rec-mini-name" title={r.name}>{r.name}</div>
                          <button
                            className="sub-view__confirm-btn sub-view__rec-mini-btn"
                            disabled={busy || subscribed}
                            onClick={() => handleSubscribe(r.name, r.feedUrl)}
                          >
                            {subscribed ? <Check size={12} /> : <Plus size={12} />}
                            {subscribed ? t('已订阅') : t('订阅')}
                          </button>
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      className="sub-view__rec-more"
                      onClick={() => setExpandedGroups(prev => ({ ...prev, [g.key]: true }))}
                    >
                      {t('查看全部')} ({items.length})
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 订阅列表 */}
      {loading ? (
        <div className="sub-view__status">
          <Loader2 size={16} className="note-preview__spin" />
          {t('加载中...')}
        </div>
      ) : infos.length === 0 ? (
        <div className="sub-view__empty">
          <Rss size={26} />
          <div>{t('还没有订阅')}</div>
          <div className="sub-view__empty-hint">{t('输入播客名搜索，或直接粘贴播客链接，无需知道 RSS 地址')}</div>
        </div>
      ) : (
        <div className="sub-view__list">
          <div className="sub-view__list-header">
            <button className="sub-view__check-all" onClick={() => handleCheck()} disabled={checking}>
              {checking ? <Loader2 size={12} className="note-preview__spin" /> : <RefreshCw size={12} />}
              {t('立即检查全部')}
            </button>
          </div>
          {infos.map(info => (
            <div key={info.sub.id} className="sub-card">
              <div className="sub-card__head">
                <div className="sub-card__title-wrap">
                  <span className="sub-card__name">{info.sub.name}</span>
                  <span className={`sub-card__badge ${info.sub.autoProcess ? 'sub-card__badge--auto' : 'sub-card__badge--manual'}`}>
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

              {info.newEpisodes.length > 0 && (
                <div className="sub-card__episodes">
                  <div className="sub-card__episodes-title">
                    {t('新节目')} ({info.newEpisodes.length})
                    {!info.sub.autoProcess && (
                      <button className="sub-card__enqueue-btn" onClick={() => handleEnqueueSelected(info.sub.id)}>
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
                          onChange={e => setSelected(prev => ({ ...prev, [ep.key]: e.target.checked }))}
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

      {/* 手动添加 RSS 兜底 */}
      <div className="sub-view__manual">
        <button className="sub-view__manual-toggle" onClick={() => setManualOpen(v => !v)}>
          <ChevronDown size={13} className={manualOpen ? 'sub-view__chevron--open' : ''} />
          {t('手动添加 RSS 地址')}
        </button>
        {manualOpen && (
          <div className="sub-view__manual-form">
            <input
              className="sub-view__field"
              placeholder={t('订阅名称（如：科技早知道）')}
              value={manualName}
              onChange={e => setManualName(e.target.value)}
            />
            <input
              className="sub-view__field"
              placeholder={t('RSS 地址（https://...）')}
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
            />
            <button
              className="sub-view__confirm-btn"
              onClick={handleManualAdd}
              disabled={busy || !manualName.trim() || !manualUrl.trim()}
            >
              <Plus size={13} />
              {t('添加订阅')}
            </button>
          </div>
        )}
      </div>

      {/* 订阅设置 */}
      <div className="sub-view__settings">
        <button className="sub-view__manual-toggle" onClick={() => setSettingsOpen(v => !v)}>
          <Settings size={13} />
          {t('订阅设置')}
        </button>
        {settingsOpen && (
          <div className="sub-view__settings-form">
            <label className="sub-view__settings-row">
              <span>{t('检查间隔（小时）')}</span>
              <input
                type="number"
                min={1}
                max={24}
                className="sub-view__field sub-view__field--small"
                value={checkInterval}
                onChange={e => setCheckInterval(Number(e.target.value))}
              />
            </label>
            <label className="sub-view__settings-row">
              <span>{t('RSSHub 服务地址')}</span>
              <input
                className="sub-view__field"
                value={rsshubBase}
                onChange={e => setRsshubBase(e.target.value)}
              />
            </label>
            <button className="sub-view__confirm-btn" onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 size={13} className="note-preview__spin" /> : null}
              {t('保存')}
            </button>
          </div>
        )}
      </div>

      {/* OPML 导入预览 */}
      {opmlPreview && (
        <div className="sub-view__opml-mask" onClick={() => setOpmlPreview(null)}>
          <div className="sub-view__opml" onClick={e => e.stopPropagation()}>
            <div className="sub-view__opml-title">{t('选择要导入的订阅')}</div>
            <div className="sub-view__opml-list">
              {opmlPreview.map((entry, i) => (
                <label key={`${i}-${entry.url}`} className="sub-view__opml-row">
                  <input
                    type="checkbox"
                    checked={!!opmlSelected[`${i}-${entry.url}`]}
                    onChange={e =>
                      setOpmlSelected(prev => ({ ...prev, [`${i}-${entry.url}`]: e.target.checked }))
                    }
                  />
                  <span className="sub-view__opml-name">{entry.name}</span>
                </label>
              ))}
            </div>
            <div className="sub-view__opml-actions">
              <button className="sub-view__tool-btn" onClick={() => setOpmlPreview(null)}>
                {t('取消')}
              </button>
              <button className="sub-view__confirm-btn" onClick={handleConfirmImport} disabled={importing}>
                {importing ? <Loader2 size={13} className="note-preview__spin" /> : null}
                {t('确认导入')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
