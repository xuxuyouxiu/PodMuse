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
} from 'lucide-react'
import NotePreviewDialog from './NotePreviewDialog'
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

/**
 * 处理历史 — 所有处理过的任务：筛选、预览、重新生成、删除
 */
export default function HistoryView({ obsidianDir, onGoWorkspace }: Props) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(() => {
    window.electronAPI
      .historyList()
      .then(list => setEntries(list))
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

  const filtered = entries.filter(
    e =>
      (platformFilter === 'all' || e.platformName === platformFilter) &&
      inRange(e.updatedAt, timeFilter),
  )

  const handleReprocess = async (e: HistoryEntry) => {
    setBusyId(e.id)
    try {
      const res = await window.electronAPI.historyReprocess(e.url)
      if (res.success) {
        flash(t('已加入处理队列'))
      } else {
        flash(t('操作失败') + ': ' + (res.error || ''))
      }
    } catch (err) {
      flash(t('操作失败') + ': ' + String(err))
    } finally {
      setBusyId('')
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

  return (
    <div className="history-view">
      <div className="history-view__head">
        <div className="history-view__title">
          <History size={15} />
          {t('处理历史')}
        </div>
        <div className="history-view__actions">
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

      {/* 筛选栏 */}
      {entries.length > 0 && (
        <div className="history-view__filters">
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
          {(platformFilter !== 'all' || timeFilter !== 'all') && (
            <button
              className="history-view__toolbar-btn"
              onClick={() => {
                setPlatformFilter('all')
                setTimeFilter('all')
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
                      <button
                        className="history-view__btn"
                        onClick={() => openPreview(e)}
                        title={t('预览')}
                      >
                        <FileText size={12} />
                      </button>
                      <button
                        className="history-view__btn"
                        onClick={() => openNote(e)}
                        title={t('打开')}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </>
                  )}
                  {(e.status === 'completed' || e.status === 'failed' || e.status === 'error') && (
                    <button
                      className="history-view__btn"
                      onClick={() => handleReprocess(e)}
                      disabled={busyId === e.id}
                      title={t('重新生成')}
                    >
                      {busyId === e.id ? (
                        <Loader2 size={12} className="note-preview__spin" />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                    </button>
                  )}
                  <button
                    className="history-view__btn history-view__btn--danger"
                    onClick={() => handleRemove(e.id)}
                    title={t('删除')}
                  >
                    <Trash2 size={12} />
                  </button>
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
    </div>
  )
}
