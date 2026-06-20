import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Pause, Play, SkipForward, Trash2, RotateCcw, Check, X, AlertCircle,
  Loader2, FileAudio, Link, ChevronDown, ChevronUp,
} from 'lucide-react'
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
  return (
    <span className="batch-queue-status" style={{ color: STATUS_COLORS[status] }}>
      {status === 'processing' && <Loader2 size={11} className="batch-queue-spin" />}
      {status === 'completed' && <Check size={11} />}
      {status === 'failed' && <AlertCircle size={11} />}
      {status === 'skipped' && <SkipForward size={11} />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function CompactSteps({ steps }: { steps: StepInfo[] }) {
  return (
    <div className="batch-queue-steps">
      {steps.map((step, i) => (
        <div
          key={i}
          className={`batch-queue-step batch-queue-step--${step.status}`}
        >
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

function SummaryView({ summary, failedTasks, onRetryAllFailed, onDismiss }: {
  summary: BatchCompletionSummary
  failedTasks: BatchTask[]
  onRetryAllFailed: () => void
  onDismiss: () => void
}) {
  const minutes = Math.round(summary.duration / 60000)
  return (
    <div className="batch-queue-summary">
      <div className="batch-queue-summary-header">
        <div className="batch-queue-summary-eyebrow">批量处理完成</div>
        <h3 className="batch-queue-summary-title">处理报告</h3>
      </div>
      <div className="batch-queue-summary-stats">
        <div className="batch-queue-stat batch-queue-stat--success">
          <div className="batch-queue-stat-value">{summary.succeeded}</div>
          <div className="batch-queue-stat-label">成功</div>
        </div>
        <div className="batch-queue-stat batch-queue-stat--error">
          <div className="batch-queue-stat-value">{summary.failed}</div>
          <div className="batch-queue-stat-label">失败</div>
        </div>
        <div className="batch-queue-stat batch-queue-stat--skip">
          <div className="batch-queue-stat-value">{summary.skipped}</div>
          <div className="batch-queue-stat-label">跳过</div>
        </div>
        <div className="batch-queue-stat">
          <div className="batch-queue-stat-value">{minutes}m</div>
          <div className="batch-queue-stat-label">总耗时</div>
        </div>
      </div>
      {failedTasks.length > 0 && (
        <div className="batch-queue-summary-failed">
          <div className="batch-queue-summary-failed-title">
            <AlertCircle size={13} />
            失败详情
          </div>
          {failedTasks.map((t, i) => (
            <div key={i} className="batch-queue-failed-item">
              <span>{t.title || t.source}</span>
              <span className="batch-queue-failed-reason">{t.failureReason}</span>
            </div>
          ))}
          <motion.button
            className="batch-queue-retry-all"
            onClick={onRetryAllFailed}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RotateCcw size={13} />
            重试全部失败
          </motion.button>
        </div>
      )}
      <div className="batch-queue-summary-actions">
        <motion.button
          className="batch-queue-dismiss"
          onClick={onDismiss}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          关闭
        </motion.button>
      </div>
    </div>
  )
}

export default function BatchQueuePanel({
  queueState, onPause, onResume, onSkip, onClear, onRetry, onRetryAllFailed, onDismiss, completionSummary,
}: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { tasks, status, completed, failed, skipped, total } = queueState
  const isPaused = status === 'paused'
  const isRunning = status === 'running'
  const isCompleted = status === 'completed'
  const failedTasks = tasks.filter(t => t.status === 'failed')

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
          onRetryAllFailed={onRetryAllFailed}
          onDismiss={onDismiss}
        />
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
          <div className="batch-queue-eyebrow">批量处理</div>
          <div className="batch-queue-progress">
            <span className="batch-queue-progress-count">
              {completed + failed + skipped}/{total}
            </span>
            <span className="batch-queue-progress-label">已完成</span>
            {isPaused && <span className="batch-queue-paused-badge">已暂停</span>}
          </div>
        </div>
        <div className="batch-queue-header-actions">
          {isRunning && (
            <motion.button
              className="batch-queue-btn"
              onClick={onPause}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="暂停"
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
            title="清空队列"
          >
            <Trash2 size={14} />
          </motion.button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="batch-queue-progress-bar">
        <div
          className="batch-queue-progress-fill"
          style={{ width: `${total > 0 ? ((completed + failed + skipped) / total * 100) : 0}%` }}
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
                    <button className="batch-queue-task-btn" onClick={() => onRetry(i)} title="重试">
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
                {(isExpanded && hasSteps) && (
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

        /* Summary view */
        .batch-queue-summary {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .batch-queue-summary-header {
          text-align: center;
        }

        .batch-queue-summary-eyebrow {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
          margin-bottom: 4px;
        }

        .batch-queue-summary-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .batch-queue-summary-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        .batch-queue-stat {
          text-align: center;
          padding: 12px;
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
        }

        .batch-queue-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .batch-queue-stat--success .batch-queue-stat-value { color: var(--success); }
        .batch-queue-stat--error .batch-queue-stat-value { color: var(--error); }

        .batch-queue-stat-label {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .batch-queue-summary-failed {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .batch-queue-summary-failed-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--error);
        }

        .batch-queue-failed-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--text-primary);
        }

        .batch-queue-failed-reason {
          color: var(--error);
          font-size: 11px;
        }

        .batch-queue-retry-all {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          background: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--accent);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 4px;
        }
        .batch-queue-retry-all:hover {
          background: var(--accent-glow);
          border-color: var(--accent);
        }

        .batch-queue-summary-actions {
          display: flex;
          justify-content: center;
          padding-top: 8px;
        }

        .batch-queue-dismiss {
          padding: 8px 32px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .batch-queue-dismiss:hover {
          opacity: 0.9;
        }
      `}</style>
    </motion.div>
  )
}
