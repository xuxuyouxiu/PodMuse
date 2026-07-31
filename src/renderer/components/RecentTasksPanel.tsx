import { Clock, RotateCcw, Play, Trash2 } from 'lucide-react'
import { RecentTaskState } from '@shared/types'
import { cleanTitle } from '@shared/utils'
import ExportMenu from './ExportMenu'

interface Props {
  tasks: RecentTaskState[]
  onResume: (task: RecentTaskState) => void
  onReplay: (task: RecentTaskState) => void
  onDelete: (taskId: string) => void
  processing: boolean
  logseqDir: string
  notionConfigured: boolean
  onToast: (msg: string, type: 'success' | 'error') => void
}

const STATUS_META: Record<RecentTaskState['status'], { label: string }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

export default function RecentTasksPanel({
  tasks,
  onResume,
  onReplay,
  onDelete,
  processing,
  logseqDir,
  notionConfigured,
  onToast,
}: Props) {
  return (
    <aside className="task-panel" style={{ height: '100%' }}>
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">历史记录</div>
          <div className="task-panel-subtitle">最近处理完成或停止的任务</div>
        </div>
        <div className="task-panel-count">{tasks.length}</div>
      </div>

      <div className="task-panel-list">
        {tasks.length === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon">
              <Clock size={24} />
            </div>
            <div className="task-panel-empty-title">暂无历史记录</div>
            <div className="task-panel-empty-copy">已结束的任务会归档到这里</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canResume = task.status !== 'completed'
          const canExport = task.status === 'completed' && !!task.filename
          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">
                    {cleanTitle(task.title || '') || cleanTitle(task.url || '') || task.url}
                  </div>
                  {task.status === 'error' && task.error && (
                    <div className="task-card-error">{task.error}</div>
                  )}
                </div>
                <span className={`task-status-badge ${task.status}`}>{meta.label}</span>
              </div>
              <div className="task-card-actions">
                {canResume && (
                  <button
                    onClick={() => onResume(task)}
                    disabled={processing}
                    className="recent-task-primary"
                  >
                    <Play size={12} /> 恢复
                  </button>
                )}
                <button
                  onClick={() => onReplay(task)}
                  disabled={processing}
                  className="recent-task-secondary"
                >
                  <RotateCcw size={12} /> 重新处理
                </button>
                {canExport && (
                  <ExportMenu
                    taskId={task.id}
                    logseqDir={logseqDir}
                    notionConfigured={notionConfigured}
                    onToast={onToast}
                  />
                )}
                <button
                  onClick={() => onDelete(task.id)}
                  disabled={processing}
                  className="recent-task-danger"
                >
                  <Trash2 size={12} /> 删除
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
