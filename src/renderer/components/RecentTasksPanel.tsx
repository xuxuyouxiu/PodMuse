import { motion } from 'motion/react'
import { Clock, RotateCcw, Play, Trash2 } from 'lucide-react'
import { RecentTaskState } from '@shared/types'

interface Props {
  tasks: RecentTaskState[]
  onResume: (task: RecentTaskState) => void
  onReplay: (task: RecentTaskState) => void
  onDelete: (taskId: string) => void
  processing: boolean
}

/**
 * 清理标题，只保留核心标题部分
 * 移除：期数（第X期、EP01、Vol5）、日期（2024-01-01、2024.01.01）、分隔符（-、|、：）、文件路径
 */
function cleanTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // URL 链接不做路径分割
  const isUrl = /^https?:\/\//.test(cleaned)
  
  if (!isUrl) {
    // 如果是文件路径，提取文件名（不含扩展名）
    const isFilePath = /^[a-zA-Z]:\\/.test(cleaned) || /^\//.test(cleaned) || cleaned.includes('\\') || cleaned.includes('/')
    if (isFilePath) {
      // 提取文件名部分（最后一个路径段）
      const parts = cleaned.split(/[\\\/]/)
      cleaned = parts[parts.length - 1] || cleaned
      // 移除文件扩展名
      cleaned = cleaned.replace(/\.[^.]+$/, '')
      // 移除常见的音频后缀（如 _music、_audio、_sound）
      cleaned = cleaned.replace(/[_\-]?(music|audio|sound|podcast)$/i, '')
    }
  }
  
  // 移除日期前缀：2026-05-18_、2024-01-01-、2024.01.01_ 等
  cleaned = cleaned.replace(/^\d{4}[-.]?\d{2}[-.]?\d{2}[_\-\s]+/, '')
  
  cleaned = cleaned
    // 移除期数前缀：第X期、第X季、EP01、Episode 1、Vol5、Vol.5 等
    .replace(/^(第\d+[期季集部季]\s*[-|：:]?\s*)/i, '')
    .replace(/^(EP?\s*\d+\s*[-|：:]?\s*)/i, '')
    .replace(/^(Episode\s*\d+\s*[-|：:]?\s*)/i, '')
    .replace(/^(Vol\.?\s*\d+\s*[-|：:.]?\s*)/i, '')
    .replace(/^(Volume\s*\d+\s*[-|：:.]?\s*)/i, '')
    .replace(/^(V\d+\s*[-|：:.]?\s*)/i, '')
    // 移除日期：2024-01-01、2024.01.01、20240101 等
    .replace(/\s*[-|：:]?\s*\d{4}[-.]?\d{2}[-.]?\d{2}\s*$/, '')
    .replace(/\s*[-|：:]?\s*\d{4}年\d{1,2}月\d{1,2}日\s*$/, '')
    // 移除首尾的分隔符和空格
    .replace(/^[\s\-|：:]+/, '')
    .replace(/[\s\-|：:]+$/, '')
    .trim()
  
  // 如果标题太长（超过50个字符），截取前50个字符并添加省略号
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50) + '...'
  }
  
  return cleaned || title
}

const STATUS_META: Record<RecentTaskState['status'], { label: string }> = {
  running: { label: '处理中' },
  stopped: { label: '已停止' },
  error: { label: '失败' },
  completed: { label: '已完成' },
}

export default function RecentTasksPanel({ tasks, onResume, onReplay, onDelete, processing }: Props) {
  return (
    <aside className="task-panel" style={{ flex: 1, minHeight: 0, marginTop: '16px' }}>
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
            <div className="task-panel-empty-icon"><Clock size={24} /></div>
            <div className="task-panel-empty-title">暂无历史记录</div>
            <div className="task-panel-empty-copy">已结束的任务会归档到这里</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canResume = task.status !== 'completed'
          return (
            <article key={task.id} className="task-card">
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">{cleanTitle(task.title || '') || cleanTitle(task.url || '') || task.url}</div>
                </div>
                <span className={`task-status-badge ${task.status}`}>{meta.label}</span>
              </div>
              <div className="task-card-actions">
                {canResume && <button onClick={() => onResume(task)} disabled={processing} className="recent-task-primary"><Play size={12} /> 恢复</button>}
                <button onClick={() => onReplay(task)} disabled={processing} className="recent-task-secondary"><RotateCcw size={12} /> 重新处理</button>
                <button onClick={() => onDelete(task.id)} disabled={processing} className="recent-task-danger"><Trash2 size={12} /> 删除</button>
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}