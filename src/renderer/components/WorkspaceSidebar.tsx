import { motion } from 'motion/react'
import {
  Settings,
  Info,
  Zap,
  Clock,
  CheckCircle2,
  Link2,
  LayoutDashboard,
  Search,
} from 'lucide-react'
import { RecentTaskState } from '@shared/types'

export type SidebarView = 'workspace' | 'backlinks' | 'search'

interface Props {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
  onSettings: () => void
  onAbout: () => void
  activeTasks: RecentTaskState[]
  recentTasks: RecentTaskState[]
}

export default function WorkspaceSidebar({
  activeView,
  onViewChange,
  onSettings,
  onAbout,
  activeTasks,
  recentTasks,
}: Props) {
  const runningCount = activeTasks.filter(t => t.status === 'running').length
  const completedToday = recentTasks.filter(t => {
    if (t.status !== 'completed') return false
    const d = new Date(t.updatedAt)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__brand">
        <img className="workspace-sidebar__logo" src="./icon.png" alt="PodMuse" />
        <div>
          <div className="workspace-sidebar__title">PodMuse</div>
          <div className="workspace-sidebar__subtitle">Workspace</div>
        </div>
      </div>

      <nav className="workspace-sidebar__nav" aria-label="工作台导航">
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'workspace' ? 'is-active' : ''}`}
          onClick={() => onViewChange('workspace')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <LayoutDashboard size={16} />
          工作台
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'backlinks' ? 'is-active' : ''}`}
          onClick={() => onViewChange('backlinks')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link2 size={16} />
          知识关联
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'search' ? 'is-active' : ''}`}
          onClick={() => onViewChange('search')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Search size={16} />
          搜索
        </motion.button>
      </nav>

      <div style={{ flex: 1 }} />

      {/* 快速统计 - 放在底部操作区上方 */}
      <div className="sidebar-stats">
        <div className="sidebar-stats__title">任务概览</div>
        <div className="sidebar-stat">
          <Zap size={13} className="sidebar-stat__icon sidebar-stat__icon--active" />
          <span className="sidebar-stat__label">进行中</span>
          <span className="sidebar-stat__value">{runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <Clock size={13} className="sidebar-stat__icon sidebar-stat__icon--queued" />
          <span className="sidebar-stat__label">排队中</span>
          <span className="sidebar-stat__value">{activeTasks.length - runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <CheckCircle2 size={13} className="sidebar-stat__icon sidebar-stat__icon--done" />
          <span className="sidebar-stat__label">今日完成</span>
          <span className="sidebar-stat__value">{completedToday}</span>
        </div>
      </div>

      <div
        className="workspace-sidebar__system-ops"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <motion.button
          type="button"
          className="workspace-sidebar__nav-item"
          onClick={onSettings}
          style={{ gap: '10px' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Settings size={16} />
          设置
        </motion.button>
        <motion.button
          type="button"
          className="workspace-sidebar__nav-item"
          onClick={onAbout}
          style={{ gap: '10px' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Info size={16} />
          关于
        </motion.button>
      </div>
    </aside>
  )
}
