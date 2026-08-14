import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Pause,
  Play,
  SkipForward,
  Trash2,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Loader2,
  FileAudio,
  Link,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { useI18n } from '../i18n'
import NotePreviewDialog from './NotePreviewDialog'
import NoteExportMenu, { type ExportAction } from './NoteExportMenu'
import type { BatchTask, BatchQueueSnapshot, BatchCompletionSummary, StepInfo } from '@shared/types'

interface Props {
  queueState: BatchQueueSnapshot
  onPause: () => void
  onResume: () => void
  onSkip: (index: number) => void
  onClear: () => void
  onRetry: (index: number) => void
  onRetryAllFailed: () => void
  onDismiss: () => void
  completionSummary?: BatchCompletionSummary | null
  obsidianDir?: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  processing: '处理中',
  completed: '已完成',
  failed: '已失败',
  skipped: '已跳过',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--text-muted)',
  processing: 'var(--accent)',
  completed: 'var(--success)',
  failed: 'var(--error)',
  skipped: 'var(--text-muted)',
}

function TaskIcon({ task }: { task: BatchTask }) {
  if (task.type === 'file') return <FileAudio size={13} />
  return <Link size={13} />
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  return (
    <span className="batch-queue-status" style={{ color: STATUS_COLORS[status] }}>
      {status === 'processing' && <Loader2 size={11} className="batch-queue-spin" />}
      {status === 'completed' && <Check size={11} />}
      {status === 'failed' && <AlertCircle size={11} />}
      {status === 'skipped' && <SkipForward size={11} />}
      {t(STATUS_LABELS[status] || status)}
    </span>
  )
}

function CompactSteps({ steps }: { steps: StepInfo[] }) {
  return (
    <div className="batch-queue-steps">
      {steps.map((step, i) => (
        <div key={i} className={`batch-queue-step batch-queue-step--${step.status}`}>
          {step.status === 'running' && <Loader2 size={10} className="batch-queue-spin" />}
          {step.status === 'done' && <Check size={10} />}
          {step.status === 'error' && <X size={10} />}
          {step.status === 'pending' && <span className="batch-queue-step-dot" />}
          <span>{step.title}</span>
        </div>
      ))}
    </div>
  )
}

function SummaryView({
  summary,
  failedTasks,
  successTasks,
  obsidianDir,
  onRetry,
  onRetryAllFailed,
  onDismiss,
}: {
  summary: BatchCompletionSummary
  failedTasks: BatchTask[]
  successTasks: BatchTask[]
  obsidianDir?: string
  onRetry: (index: number) => void
  onRetryAllFailed: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  const minutes = Math.round(summary.duration / 60000)
  const allTasks = [...successTasks, ...failedTasks]
  const total = summary.succeeded + summary.failed + summary.skipped
  const rate = total > 0 ? Math.round((summary.succeeded / total) * 100) : 0
  const allSuccess = summary.failed === 0 && summary.skipped === 0
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>('')
  const [exportingTaskId, setExportingTaskId] = useState('')
  const [exportAction, setExportAction] = useState<ExportAction | null>(null)

  const exportBusyFor = (taskId: string) => (exportingTaskId === taskId ? exportAction : null)

  /** 报告卡片统一导出（分享图 / PDF / Markdown / Notion / Logseq） */
  const handleExport = async (task: BatchTask, action: ExportAction) => {
    if (!task.filename || !obsidianDir) return
    const p = obsidianDir.replace(/[/\\]$/, '') + '/' + task.filename
    setExportingTaskId(task.id)
    setExportAction(action)
    try {
      let res: { success: boolean; cancelled?: boolean; error?: string } | null = null
      if (action === 'share') {
        res = await window.electronAPI.shareGenerate({
          notePath: p,
          title: task.title || task.filename || '',
        })
      } else if (action === 'pdf') {
        res = await window.electronAPI.exportPdf({
          notePath: p,
          title: (task.filename || '').replace(/\.md$/i, ''),
        })
      } else if (action === 'md') {
        res = await window.electronAPI.exportMd({
          notePath: p,
          title: (task.filename || '').replace(/\.md$/i, ''),
        })
      } else if (action === 'notion') {
        res = await window.electronAPI.exportToNotion(task.id)
      } else if (action === 'logseq') {
        res = await window.electronAPI.exportToLogseq(task.id)
      }
      if (!res) return
      if (res.success && !res.cancelled) {
        /* 报告内导出成功无需提示（保存对话框已反馈） */
      } else if (res.cancelled) {
        /* 用户取消 */
      } else {
        console.warn('导出失败:', res.error)
      }
    } catch (err) {
      console.warn('导出失败:', err)
    } finally {
      setExportingTaskId('')
      setExportAction(null)
    }
  }

  return (
    <div className="bq-report">
      {/* Header */}
      <div className="bq-report__header">
        <div className="bq-report__eyebrow">{t('处理报告')}</div>
        <div className="bq-report__title">{allSuccess ? t('全部处理完成') : t('处理完成')}</div>
        <div className="bq-report__sub">
          {t('共')} {total} {t('个任务')} · {t('耗时')} {minutes} {t('分钟')}
        </div>
      </div>

      {/* Stats pills */}
      <div className="bq-report__stats">
        <div className="bq-report__pill bq-report__pill--ok">
          <span className="bq-report__pill-dot bq-report__pill-dot--ok" />
          {summary.succeeded} {t('成功')}
        </div>
        {summary.failed > 0 && (
          <div className="bq-report__pill bq-report__pill--err">
            <span className="bq-report__pill-dot bq-report__pill-dot--err" />
            {summary.failed} {t('失败')}
          </div>
        )}
        {summary.skipped > 0 && (
          <div className="bq-report__pill">
            <span className="bq-report__pill-dot" />
            {summary.skipped} {t('跳过')}
          </div>
        )}
        <div className="bq-report__pill">{rate}% {t('成功率')}</div>
      </div>

      {/* Progress bar */}
      <div className="bq-report__bar-track">
        <motion.div
          className="bq-report__bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${rate}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>

      {/* Task table */}
      <div className="bq-report__table-wrap">
        <table className="bq-report__table">
          <thead>
            <tr>
              <th className="bq-report__th bq-report__th--status">{t('状态')}</th>
              <th className="bq-report__th">{t('标题')}</th>
              <th className="bq-report__th bq-report__th--action">{t('操作')}</th>
            </tr>
          </thead>
          <tbody>
            {successTasks.map(task => (
              <tr key={task.id} className="bq-report__row">
                <td className="bq-report__td bq-report__td--status">
                  <span className="bq-report__dot bq-report__dot--ok" />
                  <span className="bq-report__stext bq-report__stext--ok">{t('完成')}</span>
                </td>
                <td className="bq-report__td bq-report__td--title">
                  <span title={task.title || task.source}>{task.title || task.source}</span>
                </td>
                <td className="bq-report__td bq-report__td--action">
                  {task.filename && obsidianDir && (
                    <>
                      <NoteExportMenu
                        size={11}
                        busy={exportBusyFor(task.id)}
                        onAction={action => handleExport(task, action)}
                        className="bq-report__btn"
                      />
                      <motion.button
                        className="bq-report__btn bq-report__btn--preview"
                        onClick={() => {
                          const p = obsidianDir.replace(/[/\\]$/, '') + '/' + task.filename
                          setPreviewPath(p)
                          setPreviewName(task.title || task.filename || '')
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        <FileText size={11} />
                        {t('预览')}
                      </motion.button>
                      <motion.button
                        className="bq-report__btn bq-report__btn--open"
                        onClick={() => {
                          const p = obsidianDir.replace(/[/\\]$/, '') + '/' + task.filename
                          window.electronAPI.openPath(p)
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        <ExternalLink size={11} />
                        {t('打开')}
                      </motion.button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {failedTasks.map(task => (
              <tr key={task.id} className="bq-report__row bq-report__row--err">
                <td className="bq-report__td bq-report__td--status">
                  <span className="bq-report__dot bq-report__dot--err" />
                  <span className="bq-report__stext bq-report__stext--err">{t('失败')}</span>
                </td>
                <td className="bq-report__td bq-report__td--title">
                  <span title={task.title || task.source}>{task.title || task.source}</span>
                  {task.failureReason && <span className="bq-report__reason">{task.failureReason}</span>}
                </td>
                <td className="bq-report__td bq-report__td--action">
                  <motion.button
                    className="bq-report__btn bq-report__btn--retry"
                    onClick={() => {
                      const idx = allTasks.findIndex(x => x.id === task.id)
                      if (idx >= 0) onRetry(idx)
                    }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <RotateCcw size={11} />
                    {t('重试')}
                  </motion.button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="bq-report__footer">
        {failedTasks.length > 1 && (
          <motion.button
            className="bq-report__btn bq-report__btn--retry-all"
            onClick={onRetryAllFailed}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RotateCcw size={12} />
            {t('重试全部失败')}
          </motion.button>
        )}
        <motion.button
          className="bq-report__btn bq-report__btn--close"
          onClick={onDismiss}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {t('关闭')}
        </motion.button>
      </div>
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

export default function BatchQueuePanel({
  queueState,
  onPause,
  onResume,
  onSkip,
  onClear,
  onRetry,
  onRetryAllFailed,
  onDismiss,
  completionSummary,
  obsidianDir,
}: Props) {
  const { t } = useI18n()
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { tasks, status, completed, failed, skipped, total } = queueState
  const isPaused = status === 'paused'
  const isRunning = status === 'running'
  const isCompleted = status === 'completed'
  const failedTasks = tasks.filter(t => t.status === 'failed')
  const successTasks = tasks.filter(t => t.status === 'completed')

  if (isCompleted && completionSummary) {
    return (
      <motion.div
        className="batch-queue-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SummaryView
          summary={completionSummary}
          failedTasks={failedTasks}
          successTasks={successTasks}
          obsidianDir={obsidianDir}
          onRetry={taskListIndex => {
            // Find the actual index in the full tasks array
            const task = [...successTasks, ...failedTasks][taskListIndex]
            if (task) {
              const realIndex = tasks.findIndex(t => t.id === task.id)
              if (realIndex >= 0) onRetry(realIndex)
            }
          }}
          onRetryAllFailed={onRetryAllFailed}
          onDismiss={onDismiss}
        />
        <style>{`
          /* ── Report Card (matches app glass-card style) ── */
          .bq-report {
            display: flex;
            flex-direction: column;
            position: relative;
            width: 100%;
            box-sizing: border-box;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border);
            background: var(--bg-card);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: var(--panel-shadow);
          }

          /* Header */
          .bq-report__header {
            padding: 20px 24px 16px;
            position: relative;
            z-index: 1;
          }
          .bq-report__eyebrow {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
            margin-bottom: 6px;
          }
          .bq-report__title {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: -0.02em;
          }
          .bq-report__sub {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 4px;
          }

          /* Stat pills */
          .bq-report__stats {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 0 24px 12px;
          }
          .bq-report__pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 10px;
            border-radius: 999px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
          }
          .bq-report__pill--ok { color: var(--success); }
          .bq-report__pill--err { color: var(--error); }
          .bq-report__pill-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--text-muted);
          }
          .bq-report__pill-dot--ok { background: var(--success); }
          .bq-report__pill-dot--err { background: var(--error); }

          /* Progress bar */
          .bq-report__bar-track {
            margin: 0 24px 16px;
            height: 4px;
            border-radius: 2px;
            background: var(--border);
            overflow: hidden;
          }
          .bq-report__bar-fill {
            height: 100%;
            border-radius: 2px;
            background: linear-gradient(90deg, var(--accent), var(--success));
          }

          /* Table */
          .bq-report__table-wrap {
            flex: 1;
            overflow-y: auto;
            max-height: 300px;
            border-top: 1px solid var(--border);
          }
          .bq-report__table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .bq-report__th {
            padding: 8px 16px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted);
            text-align: left;
            border-bottom: 1px solid var(--border);
            background: var(--bg-elevated);
            position: sticky;
            top: 0;
            z-index: 1;
          }
          .bq-report__th--status { width: 64px; }
          .bq-report__th--action { width: 150px; text-align: center; }

          .bq-report__row { transition: background .12s ease; }
          .bq-report__row:hover { background: var(--bg-elevated); }
          .bq-report__row--err { background: rgba(239,68,68,.03); }
          .bq-report__row--err:hover { background: rgba(239,68,68,.06); }
          .bq-report__row + .bq-report__row td { border-top: 1px solid var(--border); }

          .bq-report__td {
            padding: 10px 16px;
            font-size: 12px;
            vertical-align: middle;
          }
          .bq-report__td--status { white-space: nowrap; }
          .bq-report__td--title { overflow: hidden; }
          .bq-report__td--title > span:first-child {
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-primary);
            line-height: 1.4;
          }
          .bq-report__td--action {
            text-align: center;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          }

          .bq-report__dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin-right: 5px;
            vertical-align: middle;
          }
          .bq-report__dot--ok { background: var(--success); }
          .bq-report__dot--err { background: var(--error); }
          .bq-report__stext {
            font-size: 11px;
            font-weight: 600;
            vertical-align: middle;
          }
          .bq-report__stext--ok { color: var(--success); }
          .bq-report__stext--err { color: var(--error); }

          .bq-report__reason {
            display: block;
            font-size: 10px;
            color: var(--error);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: .85;
          }

          /* Buttons */
          .bq-report__btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            background: none;
            transition: all .12s ease;
          }
          .bq-report__btn--open { color: var(--accent); }
          .bq-report__btn--open:hover {
            background: var(--accent-glow);
            border-color: var(--accent);
          }
          .bq-report__btn--preview { color: var(--success); }
          .bq-report__btn--preview:hover {
            background: rgba(34,197,94,.08);
            border-color: var(--success);
          }
          .bq-report__btn--retry { color: var(--warning); }
          .bq-report__btn--retry:hover {
            background: rgba(245,158,11,.08);
            border-color: var(--warning);
          }

          /* Footer */
          .bq-report__footer {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 24px;
            border-top: 1px solid var(--border);
          }
          .bq-report__btn--retry-all {
            color: var(--accent);
            padding: 5px 14px;
            font-size: 12px;
          }
          .bq-report__btn--retry-all:hover {
            background: var(--accent-glow);
            border-color: var(--accent);
          }
          .bq-report__btn--close {
            background: var(--accent);
            color: #fff;
            border-color: var(--accent);
            padding: 6px 22px;
            font-size: 12px;
          }
          .bq-report__btn--close:hover { opacity: .9; }
        `}</style>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="batch-queue-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="batch-queue-header">
        <div className="batch-queue-header-info">
          <div className="batch-queue-eyebrow">{t("批量处理")}</div>
          <div className="batch-queue-progress">
            <span className="batch-queue-progress-count">
              {completed + failed + skipped}/{total}
            </span>
            <span className="batch-queue-progress-label">{t('已完成')}</span>
            {isPaused && <span className="batch-queue-paused-badge">{t("已暂停")}</span>}
          </div>
        </div>
        <div className="batch-queue-header-actions">
          {isRunning && (
            <motion.button
              className="batch-queue-btn"
              onClick={onPause}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={t('暂停')}
            >
              <Pause size={14} />
            </motion.button>
          )}
          {isPaused && (
            <motion.button
              className="batch-queue-btn batch-queue-btn--accent"
              onClick={onResume}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="恢复"
            >
              <Play size={14} />
            </motion.button>
          )}
          <motion.button
            className="batch-queue-btn batch-queue-btn--danger"
            onClick={onClear}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={t("清空")}
          >
            <Trash2 size={14} />
          </motion.button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="batch-queue-progress-bar">
        <div
          className="batch-queue-progress-fill"
          style={{ width: `${total > 0 ? ((completed + failed + skipped) / total) * 100 : 0}%` }}
        />
      </div>

      {/* Task list */}
      <div className="batch-queue-list">
        {tasks.map((task, i) => {
          const isExpanded = expandedIndex === i
          const hasSteps = task.steps && task.steps.length > 0

          return (
            <div key={task.id} className={`batch-queue-task batch-queue-task--${task.status}`}>
              <div className="batch-queue-task-row">
                <span className="batch-queue-task-index">{i + 1}</span>
                <TaskIcon task={task} />
                <span className="batch-queue-task-name">{task.title || task.source}</span>
                {task.platform && (
                  <span className="batch-queue-task-platform">{task.platform}</span>
                )}
                <StatusBadge status={task.status} />
                <div className="batch-queue-task-actions">
                  {task.status === 'pending' && (
                    <button className="batch-queue-task-btn" onClick={() => onSkip(i)} title="跳过">
                      <SkipForward size={12} />
                    </button>
                  )}
                  {task.status === 'failed' && (
                    <button
                      className="batch-queue-task-btn"
                      onClick={() => onRetry(i)}
                      title="重试"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                  {hasSteps && (
                    <button
                      className="batch-queue-task-btn"
                      onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded steps or failure reason */}
              <AnimatePresence>
                {isExpanded && hasSteps && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <CompactSteps steps={task.steps!} />
                  </motion.div>
                )}
                {task.status === 'failed' && task.failureReason && (
                  <motion.div
                    className="batch-queue-task-error"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    {task.failureReason}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      <style>{`
        .batch-queue-panel {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          backdrop-filter: blur(20px);
        }

        .batch-queue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .batch-queue-eyebrow {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
          margin-bottom: 2px;
        }

        .batch-queue-progress {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .batch-queue-progress-count {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .batch-queue-progress-label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .batch-queue-paused-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--warning);
          background: rgba(245, 158, 11, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .batch-queue-header-actions {
          display: flex;
          gap: 6px;
        }

        .batch-queue-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .batch-queue-btn:hover {
          background: var(--bg-elevated);
        }
        .batch-queue-btn--accent {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }
        .batch-queue-btn--danger:hover {
          color: var(--error);
          border-color: var(--error);
        }

        .batch-queue-progress-bar {
          height: 4px;
          background: var(--bg-surface);
          border-radius: 2px;
          overflow: hidden;
        }

        .batch-queue-progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .batch-queue-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 400px;
          overflow-y: auto;
        }

        .batch-queue-task {
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .batch-queue-task-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          transition: background 0.15s;
        }
        .batch-queue-task:hover .batch-queue-task-row {
          background: var(--bg-surface);
        }

        .batch-queue-task--processing .batch-queue-task-row {
          background: var(--accent-glow);
        }

        .batch-queue-task-index {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          min-width: 18px;
          text-align: center;
        }

        .batch-queue-task-name {
          flex: 1;
          min-width: 0;
          font-size: 13px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .batch-queue-task-platform {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-glow);
          padding: 1px 6px;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .batch-queue-status {
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }

        .batch-queue-task-actions {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .batch-queue-task:hover .batch-queue-task-actions {
          opacity: 1;
        }

        .batch-queue-task-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        .batch-queue-task-btn:hover {
          color: var(--accent);
          background: var(--accent-glow);
        }

        .batch-queue-task-error {
          padding: 6px 10px 8px 36px;
          font-size: 12px;
          color: var(--error);
          overflow: hidden;
        }

        .batch-queue-steps {
          display: flex;
          gap: 12px;
          padding: 6px 10px 10px 36px;
          flex-wrap: wrap;
        }

        .batch-queue-step {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .batch-queue-step--running {
          color: var(--accent);
          font-weight: 600;
        }
        .batch-queue-step--done {
          color: var(--success);
        }
        .batch-queue-step--error {
          color: var(--error);
        }

        .batch-queue-step-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .batch-queue-spin {
          animation: batchSpin 1s linear infinite;
        }
        @keyframes batchSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ── Report Card (matches app glass-card style) ── */
        .bq-report {
          display: flex;
          flex-direction: column;
          position: relative;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          background: var(--bg-card);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: var(--panel-shadow);
          overflow: hidden;
        }

        /* Header */
        .bq-report__header {
          padding: 20px 24px 16px;
          position: relative;
          z-index: 1;
        }
        .bq-report__eyebrow {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .bq-report__title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        .bq-report__sub {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        /* Stat pills */
        .bq-report__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 0 24px 12px;
        }
        .bq-report__pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .bq-report__pill--ok { color: var(--success); }
        .bq-report__pill--err { color: var(--error); }
        .bq-report__pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
        }
        .bq-report__pill-dot--ok { background: var(--success); }
        .bq-report__pill-dot--err { background: var(--error); }

        /* Progress bar */
        .bq-report__bar-track {
          margin: 0 24px 16px;
          height: 4px;
          border-radius: 2px;
          background: var(--border);
          overflow: hidden;
        }
        .bq-report__bar-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, var(--accent), var(--success));
        }

        /* Table */
        .bq-report__table-wrap {
          flex: 1;
          overflow-y: auto;
          max-height: 300px;
          border-top: 1px solid var(--border);
        }
        .bq-report__table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .bq-report__th {
          padding: 8px 16px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          text-align: left;
          border-bottom: 1px solid var(--border);
          background: var(--bg-elevated);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .bq-report__th--status { width: 64px; }
        .bq-report__th--action { width: 150px; text-align: center; }

        .bq-report__row { transition: background .12s ease; }
        .bq-report__row:hover { background: var(--bg-elevated); }
        .bq-report__row--err { background: rgba(239,68,68,.03); }
        .bq-report__row--err:hover { background: rgba(239,68,68,.06); }
        .bq-report__row + .bq-report__row td { border-top: 1px solid var(--border); }

        .bq-report__td {
          padding: 10px 16px;
          font-size: 12px;
          vertical-align: middle;
        }
        .bq-report__td--status { white-space: nowrap; }
        .bq-report__td--title { overflow: hidden; }
        .bq-report__td--title > span:first-child {
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text-primary);
          line-height: 1.4;
        }
        .bq-report__td--action { text-align: center; white-space: nowrap; }

        .bq-report__dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-right: 5px;
          vertical-align: middle;
        }
        .bq-report__dot--ok { background: var(--success); }
        .bq-report__dot--err { background: var(--error); }
        .bq-report__stext {
          font-size: 11px;
          font-weight: 600;
          vertical-align: middle;
        }
        .bq-report__stext--ok { color: var(--success); }
        .bq-report__stext--err { color: var(--error); }

        .bq-report__reason {
          display: block;
          font-size: 10px;
          color: var(--error);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          opacity: .85;
        }

        /* Buttons */
        .bq-report__btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          background: none;
          transition: all .12s ease;
        }
        .bq-report__btn--open { color: var(--accent); }
        .bq-report__btn--open:hover {
          background: var(--accent-glow);
          border-color: var(--accent);
        }
        .bq-report__btn--preview { color: var(--success); }
        .bq-report__btn--preview:hover {
          background: rgba(34,197,94,.08);
          border-color: var(--success);
        }
        .bq-report__btn--retry { color: var(--warning); }
        .bq-report__btn--retry:hover {
          background: rgba(245,158,11,.08);
          border-color: var(--warning);
        }

        /* Footer */
        .bq-report__footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 24px;
          border-top: 1px solid var(--border);
        }
        .bq-report__btn--retry-all {
          color: var(--accent);
          padding: 5px 14px;
          font-size: 12px;
        }
        .bq-report__btn--retry-all:hover {
          background: var(--accent-glow);
          border-color: var(--accent);
        }
        .bq-report__btn--close {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
          padding: 6px 22px;
          font-size: 12px;
        }
        .bq-report__btn--close:hover { opacity: .9; }
      `}</style>
    </motion.div>
  )
}
