import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import {
  RotateCcw,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Check,
  AlertCircle,
  FolderOpen,
  Brain,
  X,
  MoreHorizontal,
  Search,
  Copy,
  Inbox,
  SearchX,
  ChevronRight,
  ListChecks,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react'
import NotePreviewDialog from './NotePreviewDialog'
import NoteExportMenu, { type ExportAction } from './NoteExportMenu'
import { useI18n } from '../i18n'

interface HistoryEntry {
  id: string
  url: string
  title: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'stopped' | 'error'
  filename: string | null
  platformName: string
  updatedAt: number
  error?: string
  /** load 时预计算的显示文本（render 中禁止 impure 调用） */
  timeText?: string
  timeFullText?: string
}

interface ModelOption {
  providerId: string
  providerName: string
  model: string
  isCurrent: boolean
}

interface Props {
  obsidianDir?: string
  onGoWorkspace: () => void
}

type StatusFilter = 'all' | 'completed' | 'failed'
type TimeFilter = 'all' | 'today' | '7d' | '30d' | 'year'

const STATUS_META: Record<string, { label: string; cls: string; icon: 'ok' | 'fail' }> = {
  completed: { label: '已完成', cls: 'history-badge--ok', icon: 'ok' },
  failed: { label: '处理失败', cls: 'history-badge--fail', icon: 'fail' },
  error: { label: '处理失败', cls: 'history-badge--fail', icon: 'fail' },
  stopped: { label: '已停止', cls: 'history-badge--fail', icon: 'fail' },
  pending: { label: '等待中', cls: '', icon: 'ok' },
  running: { label: '处理中', cls: '', icon: 'ok' },
  skipped: { label: '已跳过', cls: '', icon: 'ok' },
}

/** 自然时间显示：今天 HH:mm / 昨天 HH:mm / MM-DD HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, now)) return `今天 ${hm}`
  const yesterday = new Date(now.getTime() - 86400000)
  if (sameDay(d, yesterday)) return `昨天 ${hm}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

function fullTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 平台名 → 官方图标文件（public/platform-icons/，512px 官方彩色 PNG） */
const PLATFORM_ICONS: Record<string, string> = {
  小宇宙: 'xiaoyuzhou.png',
  b站: 'bilibili.png',
  bilibili: 'bilibili.png',
  喜马拉雅: 'ximalaya.png',
  ximalaya: 'ximalaya.png',
  抖音: 'douyin.png',
  douyin: 'douyin.png',
  youtube: 'youtube.png',
  apple: 'applepodcasts.png',
}

function platformIconOf(platform: string): string | null {
  if (!platform) return null
  // 归一化：去掉空格与大小写差异（'B 站'/'B站'/'bilibili' 均命中）
  const norm = platform.toLowerCase().replace(/\s+/g, '')
  const direct = PLATFORM_ICONS[platform] || PLATFORM_ICONS[norm]
  if (direct) return direct
  for (const [key, file] of Object.entries(PLATFORM_ICONS)) {
    if (norm.includes(key) || key.includes(norm)) return file
  }
  return null
}

/** 平台图标（官方高清图标，无图标时用平台首字占位） */
function PlatformThumb({ platform, size }: { platform: string; size: number }) {
  const icon = platformIconOf(platform)
  if (icon) {
    return (
      <img
        className="history-thumb history-thumb--icon"
        src={`platform-icons/${icon}`}
        alt={platform}
        style={{ width: size, height: size, borderRadius: size >= 48 ? 8 : 6 }}
      />
    )
  }
  const initial = (platform || '播').slice(0, 1)
  return (
    <div
      className="history-thumb"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 48 ? 8 : 6,
        fontSize: size * 0.45,
      }}
    >
      {initial}
    </div>
  )
}

export default function HistoryView({ obsidianDir, onGoWorkspace }: Props) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [busyId, setBusyId] = useState('')
  const [modelPicker, setModelPicker] = useState<{ entry: HistoryEntry; models: ModelOption[] } | null>(null)
  const [exportingId, setExportingId] = useState('')
  const [exportBusy, setExportBusy] = useState<ExportAction | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moreOpenId, setMoreOpenId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10
  const [noteStats, setNoteStats] = useState<Record<string, { chars: number }>>({})

  const noteStatsFor = (id: string) => noteStats[id]

  // 选中任务变化时读取笔记字数（轻量展示）
  useEffect(() => {
    if (!selectedId) return
    const entry = entries.find(e => e.id === selectedId)
    if (!entry?.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + entry.filename
    window.electronAPI
      .readNote(p)
      .then(res => {
        const content = typeof res === 'string' ? res : res?.content
        if (typeof content === 'string') {
          setNoteStats(prev => ({ ...prev, [selectedId]: { chars: content.length } }))
        }
      })
      .catch(() => {})
  }, [selectedId, entries, obsidianDir])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3000)
  }

  const [mountedAt, setMountedAt] = useState(0)

  const enrich = (list: HistoryEntry[] | null) =>
    (list || []).map((e: HistoryEntry) => ({
      ...e,
      timeText: formatTime(e.updatedAt),
      timeFullText: fullTime(e.updatedAt),
    }))

  const load = useCallback(() => {
    setLoading(true)
    setMountedAt(Date.now())
    window.electronAPI
      .historyList()
      .then(list => {
        setEntries(enrich(list))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .historyList()
      .then(list => {
        if (cancelled) return
        setMountedAt(Date.now())
        setEntries(enrich(list))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleMore = (id: string) => setMoreOpenId(prev => (prev === id ? '' : id))
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const notePathOf = (e: HistoryEntry) => {
    if (!e.filename || !obsidianDir) return ''
    return obsidianDir.replace(/[/\\]$/, '') + '/' + e.filename
  }

  const openPreview = (e: HistoryEntry) => {
    const p = notePathOf(e)
    if (!p) return
    setPreviewPath(p)
    setPreviewName(e.filename || e.title || '')
  }

  const openNote = (e: HistoryEntry) => {
    const p = notePathOf(e)
    if (!p) return
    window.electronAPI.openPath(p)
  }

  const showInFolder = (e: HistoryEntry) => {
    const p = notePathOf(e)
    if (!p) return
    window.electronAPI.showInFolder(p)
  }

  const copyLink = async (e: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(e.url)
      flash(t('已复制'))
    } catch {
      flash(t('复制失败'))
    }
  }

  const handleRemove = async (id: string) => {
    await window.electronAPI.historyRemove(id)
    setEntries(prev => prev.filter(x => x.id !== id))
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (selectedId === id) setSelectedId('')
  }

  const handleClear = async () => {
    if (!window.confirm(t('确定清空全部历史记录？此操作不影响已生成的笔记文件'))) return
    await window.electronAPI.historyClear()
    setEntries([])
    setSelected(new Set())
    setSelectedId('')
  }

  const handleReprocessClick = async (e: HistoryEntry) => {
    try {
      const models = await window.electronAPI.historyListModels()
      if (models && models.length > 1) {
        setModelPicker({ entry: e, models })
        return
      }
    } catch {
      /* 模型列表失败时直接用当前配置重跑 */
    }
    await doReprocess(e)
  }

  const doReprocess = async (e: HistoryEntry, providerId?: string, model?: string) => {
    setBusyId(e.id)
    try {
      const res = await window.electronAPI.historyReprocess(e.url, { providerId, model })
      if (res.success) {
        flash(t('已加入处理队列'))
      } else {
        flash((res.error || t('操作失败')) + '')
      }
    } catch (err) {
      flash(String(err))
    } finally {
      setBusyId('')
    }
  }

  const handleExport = async (e: HistoryEntry, action: ExportAction) => {
    const p = notePathOf(e)
    if (!p) return
    setExportingId(e.id)
    setExportBusy(action)
    try {
      let res: { success: boolean; cancelled?: boolean; error?: string } | null = null
      if (action === 'share') {
        res = await window.electronAPI.shareGenerate({ notePath: p, title: e.title || '', platform: e.platformName })
      } else if (action === 'pdf') {
        res = await window.electronAPI.exportPdf({ notePath: p, title: (e.filename || '').replace(/\.md$/i, '') })
      } else if (action === 'md') {
        res = await window.electronAPI.exportMd({ notePath: p, title: (e.filename || '').replace(/\.md$/i, '') })
      } else if (action === 'notion') {
        res = await window.electronAPI.exportToNotion(e.id)
      } else if (action === 'logseq') {
        res = await window.electronAPI.exportToLogseq(e.id)
      }
      if (!res) return
      if (res.success && !res.cancelled) {
        flash(t('已导出'))
      } else if (res.cancelled) {
        /* 用户取消 */
      } else {
        flash(t('导出失败') + ': ' + (res.error || ''))
      }
    } catch (err) {
      flash(t('导出失败') + ': ' + String(err))
    } finally {
      setExportingId('')
      setExportBusy(null)
    }
  }

  const handleExportCollection = async () => {
    const picked = entries.filter(e => selected.has(e.id) && e.filename && obsidianDir)
    if (picked.length === 0) return
    setExportingId('__collection')
    setExportBusy('pdf')
    try {
      const items = picked.map(e => ({
        notePath: notePathOf(e),
        title: e.filename!.replace(/\.md$/i, ''),
      }))
      const res = await window.electronAPI.exportPdfCollection(items)
      if (res.success && !res.cancelled) {
        flash(t('已导出'))
        setSelected(new Set())
      } else if (res.cancelled) {
        /* 用户取消 */
      } else {
        flash(t('导出失败') + ': ' + (res.error || ''))
      }
    } catch (err) {
      flash(t('导出失败') + ': ' + String(err))
    } finally {
      setExportingId('')
      setExportBusy(null)
    }
  }

  // ── 统计（真实数据动态计算） ──
  const stats = useMemo(() => {
    const total = entries.length
    const completed = entries.filter(e => e.status === 'completed').length
    const failed = entries.filter(e => e.status === 'failed' || e.status === 'error').length
    const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0'
    const withNote = entries.filter(e => e.status === 'completed' && e.filename).length
    const weekAgo = (mountedAt || 0) - 7 * 86400000
    const weekNew = entries.filter(e => e.status === 'completed' && e.updatedAt >= weekAgo).length
    const dist = new Map<string, number>()
    for (const e of entries) {
      dist.set(e.platformName, (dist.get(e.platformName) || 0) + 1)
    }
    const distList = Array.from(dist.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    const distMax = distList.length > 0 ? Math.max(...distList.map(d => d[1])) : 1
    return { total, completed, failed, rate, withNote, weekNew, distList, distMax }
  }, [entries, mountedAt])

  // ── 筛选 ──
  const platforms = useMemo(() => Array.from(new Set(entries.map(e => e.platformName))), [entries])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    const now = mountedAt || 0
    const inTime = (ts: number) => {
      if (timeFilter === 'all') return true
      const diff = now - ts
      if (timeFilter === 'today') return diff < 86400000
      if (timeFilter === '7d') return diff < 7 * 86400000
      if (timeFilter === '30d') return diff < 30 * 86400000
      return diff < 365 * 86400000
    }
    return entries.filter(e => {
      if (statusFilter === 'completed' && e.status !== 'completed') return false
      if (statusFilter === 'failed' && e.status !== 'failed' && e.status !== 'error') return false
      if (platformFilter !== 'all' && e.platformName !== platformFilter) return false
      if (!inTime(e.updatedAt)) return false
      if (kw) {
        const hay = `${e.title || ''} ${e.url || ''} ${e.platformName || ''}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    }).sort((a, b) =>
      sortBy === 'newest' ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt,
    )
  }, [entries, search, statusFilter, platformFilter, timeFilter, mountedAt, sortBy])

  // ── 分页 ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageEntries = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const selectedEntry = entries.find(e => e.id === selectedId) || null
  const isSearchEmpty = search.trim() !== '' && filtered.length === 0

  return (
    <div className="history-view">
      {/* Header */}
      <div className="history-view__head">
        <div>
          <div className="history-view__title">{t('处理历史')}</div>
          <div className="history-view__subtitle">{t('查看和管理已经处理过的任务')}</div>
        </div>
        <div className="history-view__head-actions">
          {selected.size >= 2 && (
            <button className="history-view__toolbar-btn" onClick={handleExportCollection} title={`${t('导出合集')} (${selected.size})`}>
              {exportingId === '__collection' ? <Loader2 size={13} className="note-preview__spin" /> : <FileText size={13} />}
            </button>
          )}
          <button className="history-view__toolbar-btn" onClick={() => load()} title={t('刷新')}>
            <RefreshCw size={13} />
          </button>
          {entries.length > 0 && (
            <button className="history-view__toolbar-btn" onClick={handleClear} title={t('清空历史')}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {notice && <div className="history-view__notice">{notice}</div>}

      {/* 统计卡片：5 张横向铺满 */}
      <div className="history-view__stats">
        <div className="history-view__stat">
          <div className="history-view__stat-head">
            <span className="history-view__stat-label">{t('总任务')}</span>
            <span className="history-view__stat-icon history-view__stat-icon--violet"><ListChecks size={14} /></span>
          </div>
          <div className="history-view__stat-value">{stats.total}</div>
          <div className="history-view__stat-sub">{t('全部历史任务')}</div>
        </div>
        <div className="history-view__stat">
          <div className="history-view__stat-head">
            <span className="history-view__stat-label">{t('已完成')}</span>
            <span className="history-view__stat-icon history-view__stat-icon--green"><CheckCircle2 size={14} /></span>
          </div>
          <div className="history-view__stat-value history-view__stat-value--ok">{stats.completed}</div>
          <div className="history-view__stat-sub">{t('成功率')} {stats.rate}%</div>
        </div>
        <div className="history-view__stat">
          <div className="history-view__stat-head">
            <span className="history-view__stat-label">{t('处理失败')}</span>
            <span className="history-view__stat-icon history-view__stat-icon--red"><AlertCircle size={14} /></span>
          </div>
          <div className="history-view__stat-value history-view__stat-value--fail">{stats.failed}</div>
          <div className="history-view__stat-sub">{t('可重新生成')}</div>
        </div>
        <div className="history-view__stat">
          <div className="history-view__stat-head">
            <span className="history-view__stat-label">{t('已生成笔记')}</span>
            <span className="history-view__stat-icon history-view__stat-icon--blue"><FileText size={14} /></span>
          </div>
          <div className="history-view__stat-value">{stats.withNote}</div>
          <div className="history-view__stat-sub">{t('有笔记可查看')}</div>
        </div>
        <div className="history-view__stat">
          <div className="history-view__stat-head">
            <span className="history-view__stat-label">{t('本周新增')}</span>
            <span className="history-view__stat-icon history-view__stat-icon--orange"><TrendingUp size={14} /></span>
          </div>
          <div className="history-view__stat-value">{stats.weekNew}</div>
          <div className="history-view__stat-sub">{t('最近 7 天')}</div>
        </div>
      </div>

      {/* 搜索 + 筛选 */}
      <div className="history-view__toolbar">
        <div className="history-view__search">
          <Search size={13} />
          <input
            className="history-view__search-input"
            placeholder={t('搜索标题、链接...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="history-view__search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <select className="history-view__select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">{t('全部状态')}</option>
          <option value="completed">{t('已完成')}</option>
          <option value="failed">{t('处理失败')}</option>
        </select>
        <select className="history-view__select" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
          <option value="all">{t('全部平台')}</option>
          {platforms.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="history-view__select" value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)}>
          <option value="all">{t('全部时间')}</option>
          <option value="today">{t('今天')}</option>
          <option value="7d">{t('近 7 天')}</option>
          <option value="30d">{t('近 30 天')}</option>
          <option value="year">{t('今年')}</option>
        </select>
        <select className="history-view__select" value={sortBy} onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}>
          <option value="newest">{t('最新创建')}</option>
          <option value="oldest">{t('最早创建')}</option>
        </select>
      </div>

      {/* 列表 + 详情 双栏 */}
      <div className="history-view__content">
        <div className="history-view__list-pane">
          <div className="history-view__list-head">
            <span>{t('历史任务')}</span>
            {filtered.length > 0 && <span className="history-view__list-count">{filtered.length}</span>}
          </div>

          {loading ? (
            <div className="history-view__status">
              <Loader2 size={16} className="note-preview__spin" />
              {t('加载中...')}
            </div>
          ) : entries.length === 0 ? (
            <div className="history-view__empty">
              <Inbox size={32} strokeWidth={1.2} />
              <div className="history-view__empty-title">{t('暂无处理记录')}</div>
              <div className="history-view__empty-sub">{t('处理一个播客或视频后，生成的笔记会显示在这里')}</div>
              <button className="history-view__go-btn" onClick={onGoWorkspace}>
                {t('开始处理')}
              </button>
            </div>
          ) : isSearchEmpty ? (
            <div className="history-view__empty">
              <SearchX size={32} strokeWidth={1.2} />
              <div className="history-view__empty-title">{t('没有找到相关任务')}</div>
              <div className="history-view__empty-sub">
                {t('没有找到与「')}
                {search.trim()}
                {t('」匹配的历史任务')}
              </div>
              <button className="history-view__go-btn" onClick={() => setSearch('')}>
                {t('清除搜索')}
              </button>
            </div>
          ) : (
            <>
              <div className="history-table-head">
                <span className="history-table-col history-table-col--check" />
                <span className="history-table-col history-table-col--task">{t('任务信息')}</span>
                <span className="history-table-col history-table-col--status">{t('状态')}</span>
                <span className="history-table-col history-table-col--platform">{t('平台')}</span>
                <span className="history-table-col history-table-col--time">{t('创建时间')}</span>
                <span className="history-table-col history-table-col--ops">{t('操作')}</span>
              </div>
              <div className="history-view__list">
              {pageEntries.map(e => {
                const meta = STATUS_META[e.status]
                const isSel = selectedId === e.id
                return (
                  <motion.div
                    key={e.id}
                    className={`history-row ${isSel ? 'history-row--selected' : ''}`}
                    onClick={() => setSelectedId(isSel ? '' : e.id)}
                    whileTap={{ scale: 0.995 }}
                  >
                    <span className="history-table-col history-table-col--check">
                      <input
                        type="checkbox"
                        className="history-row__check"
                        checked={selected.has(e.id)}
                        onClick={ev => ev.stopPropagation()}
                        onChange={() => toggleSelect(e.id)}
                        title={t('选择')}
                      />
                    </span>
                    <div className="history-table-col history-table-col--task history-row__task">
                      <PlatformThumb platform={e.platformName} size={36} />
                      <div className="history-row__task-main">
                        <div className="history-row__title">{e.title && !e.title.startsWith('http') ? e.title : (e.filename || '').replace(/\.md$/i, '') || t('未命名任务')}</div>
                        {e.url && <div className="history-row__url">{e.url}</div>}
                      </div>
                    </div>
                    <span className="history-table-col history-table-col--status">
                      {(e.status === 'completed' || e.status === 'failed' || e.status === 'error') && (
                        <span className={`history-badge ${meta.cls}`}>
                          {meta.icon === 'ok' ? <Check size={10} /> : <AlertCircle size={10} />}
                          {t(meta.label)}
                        </span>
                      )}
                    </span>
                    <span className="history-table-col history-table-col--platform history-row__platform-col">
                      <span className="history-row__platform">{e.platformName}</span>
                    </span>
                    <span className="history-table-col history-table-col--time">
                      <span className="history-row__time" title={e.timeFullText}>
                        {e.timeText}
                      </span>
                    </span>
                    <div className="history-table-col history-table-col--ops history-row__ops" onClick={ev => ev.stopPropagation()}>
                      {e.filename && obsidianDir && (
                        <button className="history-row__btn" onClick={() => openPreview(e)} title={t('预览')}>
                          <FileText size={12} />
                        </button>
                      )}
                      {e.filename && obsidianDir && (
                        <NoteExportMenu busy={exportingId === e.id ? (exportBusy || null) : null} onAction={action => handleExport(e, action)} size={12} />
                      )}
                      {(e.status === 'failed' || e.status === 'error') && (
                        <button className="history-row__btn history-row__btn--retry" onClick={() => handleReprocessClick(e)} disabled={busyId === e.id} title={t('重新生成')}>
                          {busyId === e.id ? <Loader2 size={12} className="note-preview__spin" /> : <RotateCcw size={12} />}
                        </button>
                      )}
                      <div className="history-view__more">
                        <button className="history-row__btn" onClick={() => toggleMore(e.id)} title={t('更多')}>
                          <MoreHorizontal size={12} />
                        </button>
                        {moreOpenId === e.id && (
                          <div className="history-view__more-pop">
                            <button
                              className="history-view__more-item"
                              onClick={() => {
                                setMoreOpenId('')
                                setSelectedId(e.id)
                              }}
                            >
                              <ChevronRight size={12} />
                              {t('查看详情')}
                            </button>
                            {e.filename && obsidianDir && (
                              <>
                                <button
                                  className="history-view__more-item"
                                  onClick={() => {
                                    setMoreOpenId('')
                                    openNote(e)
                                  }}
                                >
                                  <ExternalLink size={12} />
                                  {t('打开笔记')}
                                </button>
                                <button
                                  className="history-view__more-item"
                                  onClick={() => {
                                    setMoreOpenId('')
                                    showInFolder(e)
                                  }}
                                >
                                  <FolderOpen size={12} />
                                  {t('打开所在文件夹')}
                                </button>
                              </>
                            )}
                            <button
                              className="history-view__more-item"
                              onClick={() => {
                                setMoreOpenId('')
                                copyLink(e)
                              }}
                            >
                              <Copy size={12} />
                              {t('复制链接')}
                            </button>
                            {e.status !== 'completed' && (
                              <button
                                className="history-view__more-item"
                                onClick={() => {
                                  setMoreOpenId('')
                                  handleReprocessClick(e)
                                }}
                              >
                                <RotateCcw size={12} />
                                {t('重新生成')}
                              </button>
                            )}
                            <button
                              className="history-view__more-item history-view__more-item--danger"
                              onClick={() => {
                                setMoreOpenId('')
                                handleRemove(e.id)
                              }}
                            >
                              <Trash2 size={12} />
                              {t('删除')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
            {/* 分页栏 */}
            {totalPages > 1 && (
              <div className="history-view__pager">
                <span className="history-view__pager-info">
                  {t('共')} {filtered.length} {t('条记录')}
                </span>
                <div className="history-view__pager-nav">
                  <button className="history-view__pager-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                    ‹
                  </button>
                  <span className="history-view__pager-current">{safePage} / {totalPages}</span>
                  <button className="history-view__pager-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                    ›
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* 右侧任务详情（小而精，与列表齐平） */}
        <div className="history-view__detail-pane">
          <div className="history-detail">
            <div className="history-detail__head">
              <span>{t('任务详情')}</span>
              {selectedEntry && (
                <button className="history-detail__close" onClick={() => setSelectedId('')} title={t('关闭')}>
                  <X size={13} />
                </button>
              )}
            </div>
            {selectedEntry ? (
              <div className="history-detail__body">
                <div className="history-detail__cover">
                  <PlatformThumb platform={selectedEntry.platformName} size={56} />
                </div>
                <div className="history-detail__title">
                  {selectedEntry.title && !selectedEntry.title.startsWith('http')
                    ? selectedEntry.title
                    : (selectedEntry.filename || '').replace(/\.md$/i, '') || t('未命名任务')}
                </div>
                {selectedEntry.url && <div className="history-detail__url">{selectedEntry.url}</div>}
                <div className="history-detail__meta">
                  {selectedEntry.platformName && <span className="history-row__platform">{selectedEntry.platformName}</span>}
                </div>
                <div className="history-detail__divider" />
                {(selectedEntry.status === 'completed' || selectedEntry.status === 'failed' || selectedEntry.status === 'error') && (
                  <div className="history-detail__row">
                    <span className="history-detail__label">{t('状态')}</span>
                    <span className={`history-badge ${STATUS_META[selectedEntry.status].cls}`}>
                      {STATUS_META[selectedEntry.status].icon === 'ok' ? <Check size={10} /> : <AlertCircle size={10} />}
                      {t(STATUS_META[selectedEntry.status].label)}
                    </span>
                  </div>
                )}
                <div className="history-detail__row">
                  <span className="history-detail__label">{t('时间')}</span>
                  <span className="history-detail__value" title={selectedEntry.timeFullText}>
                    {selectedEntry.timeText}
                  </span>
                </div>
                {selectedEntry.error && (
                  <div className="history-detail__row">
                    <span className="history-detail__label">{t('失败原因')}</span>
                    <span className="history-detail__value history-detail__value--err">{selectedEntry.error}</span>
                  </div>
                )}
                <div className="history-detail__row">
                  <span className="history-detail__label">{t('笔记')}</span>
                  {selectedEntry.filename ? (
                    <span className="history-detail__note-ok">
                      <Check size={10} />
                      {t('已生成')}
                    </span>
                  ) : (
                    <span className="history-detail__value">—</span>
                  )}
                </div>
                {selectedEntry.filename && obsidianDir && (
                  <div className="history-detail__row">
                    <span className="history-detail__label">{t('笔记字数')}</span>
                    <span className="history-detail__value">{noteStatsFor(selectedEntry.id)?.chars ?? '…'}</span>
                  </div>
                )}
                <div className="history-detail__divider" />
                <div className="history-detail__actions">
                  {selectedEntry.filename && obsidianDir && (
                    <button className="history-detail__btn history-detail__btn--primary" onClick={() => openPreview(selectedEntry)}>
                      <FileText size={12} />
                      {t('查看笔记')}
                    </button>
                  )}
                  {selectedEntry.filename && obsidianDir && (
                    <NoteExportMenu busy={exportingId === selectedEntry.id ? (exportBusy || null) : null} onAction={action => handleExport(selectedEntry, action)} size={12} className="history-detail__iconbtn" />
                  )}
                  <div className="history-view__more">
                    <button className="history-detail__btn" onClick={() => toggleMore(selectedEntry.id)} title={t('更多')}>
                      <MoreHorizontal size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="history-detail__empty">
                <ChevronRight size={28} strokeWidth={1.2} />
                <div className="history-detail__empty-title">{t('请选择一个历史任务')}</div>
                <div className="history-detail__empty-sub">{t('查看任务详细信息')}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewPath && (
        <NotePreviewDialog
          filePath={previewPath}
          filename={previewName}
          onClose={() => setPreviewPath(null)}
        />
      )}

      {modelPicker && (
        <div className="history-model-mask" onClick={() => setModelPicker(null)}>
          <div className="history-model" onClick={e => e.stopPropagation()}>
            <div className="history-model__head">
              <div className="history-model__title">
                <Brain size={14} />
                {t('选择生成模型')}
              </div>
              <button className="history-model__close" onClick={() => setModelPicker(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="history-model__list">
              {modelPicker.models.map(m => (
                <label key={m.providerId + m.model} className="history-model__item">
                  <input
                    type="radio"
                    name="reprocess-model"
                    defaultChecked={m.isCurrent}
                    onChange={() => {
                      const chosen = m
                      setModelPicker(null)
                      doReprocess(modelPicker.entry, chosen.providerId, chosen.model)
                    }}
                  />
                  <span className="history-model__name">
                    {m.providerName} · {m.model}
                    {m.isCurrent && <em className="history-model__current">{t('当前')}</em>}
                  </span>
                </label>
              ))}
            </div>
            <div className="history-model__foot">
              <button className="history-model__btn" onClick={() => setModelPicker(null)}>
                {t('取消')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
