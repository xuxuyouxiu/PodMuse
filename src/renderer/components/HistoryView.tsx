import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Clock,
  RotateCcw,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Check,
  AlertCircle,
  History,
  FolderOpen,
  Brain,
  X,
  MoreHorizontal,
} from 'lucide-react'
import NotePreviewDialog from './NotePreviewDialog'
import NoteExportMenu, { type ExportAction } from './NoteExportMenu'
import { useI18n } from '../i18n'

interface Props {
  obsidianDir?: string
  onGoWorkspace?: () => void
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: 'var(--success)' },
  failed: { label: '已失败', color: 'var(--error)' },
  error: { label: '已失败', color: 'var(--error)' },
  stopped: { label: '已停止', color: 'var(--text-muted)' },
  running: { label: '处理中', color: 'var(--accent)' },
  pending: { label: '等待中', color: 'var(--text-muted)' },
  skipped: { label: '已跳过', color: 'var(--text-muted)' },
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inRange(ts: number, range: string): boolean {
  if (range === 'all') return true
  const now = Date.now()
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 30
  return ts >= now - days * 86400000
}

/** 模型选择弹窗（重新生成时选模型） */
function ModelPicker({
  models,
  onPick,
  onCancel,
}: {
  models: ModelOption[]
  onPick: (m: ModelOption) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string>(
    models.find(m => m.isCurrent)?.providerId + '::' + models.find(m => m.isCurrent)?.model || models[0]?.providerId + '::' + models[0]?.model,
  )
  return (
    <div className="history-model-mask" onClick={onCancel}>
      <div className="history-model" onClick={e => e.stopPropagation()}>
        <div className="history-model__head">
          <span className="history-model__title">
            <Brain size={14} />
            {t('选择生成模型')}
          </span>
          <button className="history-model__close" onClick={onCancel} title={t('关闭')}>
            <X size={13} />
          </button>
        </div>
        <div className="history-model__list">
          {models.map(m => {
            const key = `${m.providerId}::${m.model}`
            return (
              <label key={key} className="history-model__item">
                <input
                  type="radio"
                  name="regen-model"
                  checked={selected === key}
                  onChange={() => setSelected(key)}
                />
                <span className="history-model__name">
                  {m.providerName} · {m.model}
                  {m.isCurrent && <em className="history-model__current">{t('当前')}</em>}
                </span>
              </label>
            )
          })}
        </div>
        <div className="history-model__foot">
          <button className="history-model__btn history-model__btn--ghost" onClick={onCancel}>
            {t('取消')}
          </button>
          <button
            className="history-model__btn history-model__btn--primary"
            onClick={() => {
              const [providerId, model] = selected.split('::')
              const m = models.find(x => x.providerId === providerId && x.model === model)
              if (m) onPick(m)
            }}
          >
            {t('开始生成')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 处理历史（资产视图）— 成功笔记统计 + 筛选 + 重新生成（可选模型）
 */
export default function HistoryView({ obsidianDir, onGoWorkspace }: Props) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'success' | 'all'>('success')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [modelPicker, setModelPicker] = useState<{ entry: HistoryEntry; models: ModelOption[] } | null>(null)
  const [notesThisWeek, setNotesThisWeek] = useState(0)
  const [exportingId, setExportingId] = useState('')
  const [exportBusy, setExportBusy] = useState<ExportAction | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moreOpenId, setMoreOpenId] = useState('')

  const toggleMore = (id: string) => setMoreOpenId(prev => (prev === id ? '' : id))

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const load = useCallback(() => {
    window.electronAPI
      .historyList()
      .then(list => {
        setEntries(list)
        const weekMs = 7 * 86400000
        setNotesThisWeek(
          list.filter(
            e => e.status === 'completed' && e.filename && e.updatedAt >= Date.now() - weekMs,
          ).length,
        )
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  const platforms = Array.from(new Set(entries.map(e => e.platformName)))

  // 统计卡（资产视角：只统计成功产出笔记）
  const notes = entries.filter(e => e.status === 'completed' && e.filename)
  const successRate =
    entries.length > 0 ? Math.round((notes.length / entries.length) * 100) : 0
  const platformDist = new Map<string, number>()
  for (const e of notes) {
    platformDist.set(e.platformName, (platformDist.get(e.platformName) || 0) + 1)
  }
  const topPlatforms = Array.from(platformDist.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const maxPlatform = topPlatforms[0]?.[1] || 1

  const filtered = entries.filter(
    e =>
      (platformFilter === 'all' || e.platformName === platformFilter) &&
      inRange(e.updatedAt, timeFilter) &&
      (statusFilter === 'all' ||
        (statusFilter === 'success' && e.status === 'completed' && e.filename)),
  )

  const doReprocess = async (entry: HistoryEntry, model?: ModelOption) => {
    setBusyId(entry.id)
    try {
      const res = await window.electronAPI.historyReprocess(
        entry.url,
        model ? { providerId: model.providerId, model: model.model } : undefined,
      )
      if (res.success) {
        flash(model ? `${t('已加入处理队列')}（${model.providerName} · ${model.model}）` : t('已加入处理队列'))
      } else {
        flash(t('操作失败') + ': ' + (res.error || ''))
      }
    } catch (err) {
      flash(t('操作失败') + ': ' + String(err))
    } finally {
      setBusyId('')
    }
  }

  const handleReprocessClick = async (entry: HistoryEntry) => {
    try {
      const models = await window.electronAPI.historyListModels()
      if (models.length > 1) {
        setModelPicker({ entry, models })
      } else {
        await doReprocess(entry)
      }
    } catch {
      await doReprocess(entry)
    }
  }

  const handleRemove = async (id: string) => {
    await window.electronAPI.historyRemove(id)
    load()
  }

  const handleClear = async () => {
    if (!window.confirm(t('确定清空全部历史记录？此操作不影响已生成的笔记文件'))) return
    await window.electronAPI.historyClear()
    load()
  }

  const openPreview = (e: HistoryEntry) => {
    if (!e.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + e.filename
    setPreviewPath(p)
    setPreviewName(e.title || e.filename)
  }

  const openNote = (e: HistoryEntry) => {
    if (!e.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + e.filename
    window.electronAPI.openPath(p)
  }

  const showInFolder = (e: HistoryEntry) => {
    if (!e.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + e.filename
    window.electronAPI.showInFolder(p)
  }

  /** 统一导出入口（分享图 / PDF / Markdown / Notion / Logseq） */
  const handleExport = async (e: HistoryEntry, action: ExportAction) => {
    if (!e.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + e.filename
    setExportingId(e.id)
    setExportBusy(action)
    try {
      let res: { success: boolean; cancelled?: boolean; error?: string } | null = null
      if (action === 'share') {
        res = await window.electronAPI.shareGenerate({
          notePath: p,
          title: e.title || e.filename || '',
          platform: e.platformName,
        })
      } else if (action === 'pdf') {
        res = await window.electronAPI.exportPdf({
          notePath: p,
          title: (e.filename || '').replace(/\.md$/i, ''),
        })
      } else if (action === 'md') {
        res = await window.electronAPI.exportMd({
          notePath: p,
          title: (e.filename || '').replace(/\.md$/i, ''),
        })
      } else if (action === 'notion') {
        res = await window.electronAPI.exportToNotion(e.id)
      } else if (action === 'logseq') {
        res = await window.electronAPI.exportToLogseq(e.id)
      }
      if (!res) return
      if (res.success && !res.cancelled) {
        flash(t('已导出'))
      } else if (res.cancelled) {
        /* 用户取消，静默 */
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

  /** 导出选中的多篇为 PDF 合集 */
  const handleExportCollection = async () => {
    const picked = entries.filter(e => selected.has(e.id) && e.filename && obsidianDir)
    if (picked.length === 0) return
    setExportingId('__collection')
    setExportBusy('pdf')
    try {
      const items = picked.map(e => ({
        notePath: obsidianDir!.replace(/[/\\]$/, '') + '/' + e.filename!,
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

  return (
    <div className="history-view">
      <div className="history-view__head">
        <div className="history-view__title">
          <History size={15} />
          {t('处理历史')}
        </div>
        <div className="history-view__actions">
          {selected.size >= 2 && (
            <button
              className="history-view__toolbar-btn history-view__toolbar-btn--collection"
              onClick={handleExportCollection}
              title={`${t('导出合集')} (${selected.size})`}
            >
              {exportingId === '__collection' ? (
                <Loader2 size={13} className="note-preview__spin" />
              ) : (
                <FileText size={13} />
              )}
            </button>
          )}
          <button className="history-view__toolbar-btn" onClick={load} title={t('刷新')}>
            <RefreshCw size={13} />
          </button>
          {entries.length > 0 && (
            <button className="history-view__toolbar-btn" onClick={handleClear} title={t('清空历史')}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 资产统计卡 */}
      {notes.length > 0 && (
        <div className="history-view__stats">
          <div className="history-view__stat">
            <div className="history-view__stat-value">{notes.length}</div>
            <div className="history-view__stat-label">{t('累计笔记')}</div>
          </div>
          <div className="history-view__stat">
            <div className="history-view__stat-value">{notesThisWeek}</div>
            <div className="history-view__stat-label">{t('本周新增')}</div>
          </div>
          <div className="history-view__stat">
            <div className="history-view__stat-value">{successRate}%</div>
            <div className="history-view__stat-label">{t('成功率')}</div>
          </div>
          <div className="history-view__stat history-view__stat--dist">
            <div className="history-view__stat-label">{t('平台分布')}</div>
            <div className="history-view__dist-bars">
              {topPlatforms.map(([name, count]) => (
                <div key={name} className="history-view__dist-row">
                  <span className="history-view__dist-name">{name}</span>
                  <div className="history-view__dist-track">
                    <div
                      className="history-view__dist-fill"
                      style={{ width: `${Math.round((count / maxPlatform) * 100)}%` }}
                    />
                  </div>
                  <span className="history-view__dist-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 筛选栏 */}
      {entries.length > 0 && (
        <div className="history-view__filters">
          <select
            className="history-view__select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'success' | 'all')}
          >
            <option value="success">{t('仅成功笔记')}</option>
            <option value="all">{t('全部任务')}</option>
          </select>
          <select
            className="history-view__select"
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
          >
            <option value="all">{t('全部平台')}</option>
            {platforms.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="history-view__select"
            value={timeFilter}
            onChange={e => setTimeFilter(e.target.value)}
          >
            <option value="all">{t('全部时间')}</option>
            <option value="today">{t('今天')}</option>
            <option value="7d">{t('近 7 天')}</option>
            <option value="30d">{t('近 30 天')}</option>
          </select>
          {(platformFilter !== 'all' || timeFilter !== 'all' || statusFilter !== 'success') && (
            <button
              className="history-view__toolbar-btn"
              onClick={() => {
                setPlatformFilter('all')
                setTimeFilter('all')
                setStatusFilter('success')
              }}
              title={t('重置')}
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      )}

      {notice && <div className="history-view__notice">{notice}</div>}

      {loading ? (
        <div className="history-view__status">
          <Loader2 size={16} className="note-preview__spin" />
          {t('加载中...')}
        </div>
      ) : entries.length === 0 ? (
        <div className="history-view__status history-view__status--empty">
          <Clock size={24} />
          <div>{t('还没有处理记录')}</div>
          {onGoWorkspace && (
            <button className="history-view__go-btn" onClick={onGoWorkspace}>
              {t('去处理播客')}
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="history-view__status">{t('没有符合条件的记录')}</div>
      ) : (
        <div className="history-view__list">
          {filtered.map(e => {
            const meta = STATUS_META[e.status] || STATUS_META.failed
            return (
              <motion.div
                key={e.id}
                className="history-view__row"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span className="history-view__platform">{e.platformName}</span>
                <div className="history-view__info">
                  <div className="history-view__name" title={e.title || e.url}>
                    {e.title || e.url}
                  </div>
                  <div className="history-view__meta">
                    <span style={{ color: meta.color }} className="history-view__status">
                      {e.status === 'completed' && <Check size={11} />}
                      {e.status === 'failed' && <AlertCircle size={11} />}
                      {e.status === 'error' && <AlertCircle size={11} />}
                      {t(meta.label)}
                    </span>
                    <span className="history-view__time">{formatTime(e.updatedAt)}</span>
                  </div>
                  {e.error && <div className="history-view__error">{e.error}</div>}
                </div>
                <div className="history-view__ops">
                  {e.filename && obsidianDir && (
                    <>
                      <input
                        type="checkbox"
                        className="history-view__check"
                        checked={selected.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        title={t('选择')}
                      />
                      <button
                        className="history-view__btn history-view__btn--text"
                        onClick={() => openPreview(e)}
                      >
                        <FileText size={11} />
                        {t('预览')}
                      </button>
                      <NoteExportMenu
                        busy={exportingId === e.id ? (exportBusy || null) : null}
                        onAction={action => handleExport(e, action)}
                      />
                      <div className="history-view__more">
                        <button
                          className="history-view__btn history-view__btn--text"
                          onClick={() => toggleMore(e.id)}
                        >
                          {t('更多')}
                          <MoreHorizontal size={12} />
                        </button>
                        {moreOpenId === e.id && (
                          <div className="history-view__more-pop">
                            <button
                              className="history-view__more-item"
                              onClick={() => {
                                setMoreOpenId('')
                                openNote(e)
                              }}
                            >
                              <ExternalLink size={12} />
                              {t('打开')}
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
                    </>
                  )}
                  {(e.status === 'completed' || e.status === 'failed' || e.status === 'error') && (
                    <button
                      className="history-view__btn history-view__btn--text"
                      onClick={() => handleReprocessClick(e)}
                      disabled={busyId === e.id}
                    >
                      {busyId === e.id ? (
                        <Loader2 size={11} className="note-preview__spin" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                      {t('重新生成')}
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {previewPath && (
        <NotePreviewDialog
          filePath={previewPath}
          filename={previewName}
          onClose={() => setPreviewPath(null)}
        />
      )}

      {modelPicker && (
        <ModelPicker
          models={modelPicker.models}
          onPick={m => {
            const entry = modelPicker.entry
            setModelPicker(null)
            void doReprocess(entry, m)
          }}
          onCancel={() => setModelPicker(null)}
        />
      )}
    </div>
  )
}
