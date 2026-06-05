import { useState } from 'react'
import { Zap, Square, Loader2 } from 'lucide-react'
import { RecentTaskState } from '@shared/types'

interface Props {
  tasks: RecentTaskState[]
  processing: boolean
  onCancel: (taskId: string) => void
}

const STATUS_META: Record<RecentTaskState['status'], { label: string }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

export default function ActiveTasksPanel({ tasks, processing: _processing, onCancel }: Props) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleStop = async (taskId: string) => {
    setCancellingId(taskId)
    try {
      await onCancel(taskId)
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <aside className="task-panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">活跃任务</div>
          <div className="task-panel-subtitle">正在处理或排队中的任务</div>
        </div>
        <div className="task-panel-count">{tasks.length}</div>
      </div>

      <div className="task-panel-list">
        {tasks.length === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon"><Zap size={24} /></div>
            <div className="task-panel-empty-title">暂无活跃任务</div>
            <div className="task-panel-empty-copy">新发起的任务会显示在这里</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canStop = task.status === 'running'
          const isStopping = cancellingId === task.id

          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">{task.title || task.url}</div>
                </div>
                <span className={`task-status-badge ${task.status}`}>{meta.label}</span>
              </div>
              <div className="task-card-actions">
                {canStop && (
                  <button
                    onClick={() => handleStop(task.id)}
                    disabled={isStopping}
                    className="recent-task-danger"
                  >
                    {isStopping ? <><Loader2 size={12} className="animate-spin" /> 停止中...</> : <><Square size={12} /> 停止</>}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}