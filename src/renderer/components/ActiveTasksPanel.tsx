import { useState } from 'react'
import { Zap, Square, Loader2, Play, Trash2, ListOrdered } from 'lucide-react'
import type { RecentTaskState, BatchTask, BatchQueueStatus } from '@shared/types'
import { useI18n, type TranslationKey } from '../i18n'

interface Props {
  tasks: RecentTaskState[]
  processing: boolean
  onCancel: (taskId: string) => void
  onResume?: (task: RecentTaskState) => void
  onDelete?: (taskId: string) => void
  batchTasks?: BatchTask[]
  batchStatus?: BatchQueueStatus
}

const STATUS_META: Record<RecentTaskState['status'], { label: TranslationKey }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

const BATCH_STATUS_META: Record<BatchTask['status'], { label: TranslationKey; className: string }> = {
  pending: { label: '排队中', className: 'pending' },
  processing: { label: '处理中', className: 'running' },
  completed: { label: '已完成', className: 'completed' },
  failed: { label: '失败', className: 'error' },
  skipped: { label: '已跳过', className: 'stopped' },
}

export default function ActiveTasksPanel({
  tasks,
  processing: _processing,
  onCancel,
  onResume,
  onDelete,
  batchTasks,
  batchStatus,
}: Props) {
  const { t } = useI18n()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const hasBatch = batchTasks && batchTasks.length > 0
  const batchPending = hasBatch ? batchTasks.filter(t => t.status === 'pending').length : 0
  const totalVisible = tasks.length + (hasBatch ? batchTasks.length : 0)
  const isActive = batchStatus === 'running' || batchStatus === 'paused'

  const handleStop = async (taskId: string) => {
    setCancellingId(taskId)
    try {
      await onCancel(taskId)
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <aside className="task-panel" style={{ height: '100%' }}>
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">{t('活跃任务')}</div>
          <div className="task-panel-subtitle">
            {isActive ? t('批量处理中') + ' — ' + t('剩余') + ' ' + batchPending + ' ' + t('项') : t('正在处理或排队中的任务')}
          </div>
        </div>
        <div className="task-panel-count">{totalVisible}</div>
      </div>

      <div className="task-panel-list">
        {totalVisible === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon">
              <Zap size={24} />
            </div>
            <div className="task-panel-empty-title">{t('暂无活跃任务')}</div>
            <div className="task-panel-empty-copy">{t('新发起的任务会显示在这里')}</div>
          </div>
        )}

        {/* Regular active tasks */}
        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canStop = task.status === 'running'
          const canResume = task.status === 'stopped' || task.status === 'error'
          const canDelete = task.status !== 'running'
          const isStopping = cancellingId === task.id

          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">{task.title || task.url}</div>
                </div>
                <span className={`task-status-badge ${task.status}`}>{t(meta.label)}</span>
              </div>
              <div className="task-card-actions">
                {canStop && (
                  <button
                    onClick={() => handleStop(task.id)}
                    disabled={isStopping}
                    className="recent-task-danger"
                  >
                    {isStopping ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> {t('停止中...')}
                      </>
                    ) : (
                      <>
                        <Square size={12} /> {t('停止')}
                      </>
                    )}
                  </button>
                )}
                {canResume && onResume && (
                  <button onClick={() => onResume(task)} className="recent-task-primary">
                    <Play size={12} /> {t('重新处理')}
                  </button>
                )}
                {canDelete && onDelete && (
                  <button onClick={() => onDelete(task.id)} className="recent-task-danger">
                    <Trash2 size={12} /> {t('删除')}
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {/* Batch queue tasks */}
        {hasBatch && (
          <>
            <div className="batch-section-header">
              <ListOrdered size={13} />
              <span>{t('批量队列')}</span>
              {batchStatus === 'paused' && <span className="batch-section-badge">{t('已暂停')}</span>}
            </div>
            {batchTasks.map((task, i) => {
              const meta = BATCH_STATUS_META[task.status] || { label: task.status, className: '' }
              const isProcessing = task.status === 'processing'
              const isPending = task.status === 'pending'
              const isFailed = task.status === 'failed'

              return (
                <article
                  key={task.id}
                  className={`task-card task-card--batch ${isProcessing ? 'task-card--active' : ''}`}
                >
                  <div className="task-card-header">
                    <div className="task-card-copy">
                      <span className="batch-task-index">{i + 1}</span>
                      <div className="task-card-title">{task.title || task.source}</div>
                    </div>
                    <span className={`task-status-badge ${meta.className}`}>
                      {isProcessing && <Loader2 size={10} className="animate-spin" />}
                      {t(meta.label)}
                    </span>
                  </div>
                  {isFailed && task.failureReason && (
                    <div className="batch-task-error">{task.failureReason}</div>
                  )}
                  {isProcessing && task.steps && task.steps.length > 0 && (
                    <div className="batch-task-steps">
                      {task.steps.map((step, si) => (
                        <span
                          key={si}
                          className={`batch-step-dot batch-step-dot--${step.status}`}
                          title={step.title}
                        >
                          {step.status === 'done'
                            ? '✓'
                            : step.status === 'running'
                              ? '◉'
                              : step.status === 'error'
                                ? '✗'
                                : '○'}
                        </span>
                      ))}
                    </div>
                  )}
                  {(isPending || isProcessing) && (
                    <div className="task-card-meta">
                      {task.type === 'file' ? '本地文件' : task.platform || 'URL'}
                    </div>
                  )}
                </article>
              )
            })}
          </>
        )}
      </div>
    </aside>
  )
}
