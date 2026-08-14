import { Clock, RotateCcw, Play, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { RecentTaskState } from '@shared/types'
import { cleanTitle } from '@shared/utils'
import ExportMenu from './ExportMenu'
import { useI18n, type TranslationKey } from '../i18n'

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

const STATUS_META: Record<RecentTaskState['status'], { label: TranslationKey }> = {
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
  const { t } = useI18n()
  return (
    <motion.aside
      className="task-panel"
      style={{ height: '100%' }}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="task-panel-header">
        <div>
          <div className="task-panel-title">{t('历史记录')}</div>
          <div className="task-panel-subtitle">{t('最近处理完成或停止的任务')}</div>
        </div>
        <div className="task-panel-count">{tasks.length}</div>
      </div>

      <div className="task-panel-list">
        <AnimatePresence initial={false}>
        {tasks.length === 0 && (
          <div className="task-panel-empty">
            <div className="task-panel-empty-icon">
              <Clock size={24} />
            </div>
            <div className="task-panel-empty-title">{t("暂无历史记录")}</div>
            <div className="task-panel-empty-copy">{t('已结束的任务会归档到这里')}</div>
          </div>
        )}

        {tasks.map(task => {
          const meta = STATUS_META[task.status] || { label: task.status }
          const canResume = task.status !== 'completed'
          const canExport = task.status === 'completed' && !!task.filename
          return (
            <motion.article
              key={task.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="task-card"
            >
              <div className="task-card-header">
                <div className="task-card-copy">
                  <div className="task-card-title">
                    {cleanTitle(task.title || '') || (task.filename || '').replace(/\.md$/i, '') || (task.url && !task.url.startsWith('http') ? task.url : t('未命名任务'))}
                  </div>
                  {task.status === 'error' && task.error && (
                    <div className="task-card-error">{task.error}</div>
                  )}
                </div>
                <span className={`task-status-badge ${task.status}`}>{t(meta.label)}</span>
              </div>
              <div className="task-card-actions">
                {canResume && (
                  <button
                    onClick={() => onResume(task)}
                    disabled={processing}
                    className="recent-task-primary"
                  >
                    <Play size={12} /> {t('恢复')}
                  </button>
                )}
                <button
                  onClick={() => onReplay(task)}
                  disabled={processing}
                  className="recent-task-secondary"
                >
                  <RotateCcw size={12} /> {t("重试")}
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
                  <Trash2 size={12} /> {t('删除')}
                </button>
              </div>
            </motion.article>
          )
        })}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}
