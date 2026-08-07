import { useEffect, useState } from 'react'
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
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
  const [version, setVersion] = useState<string>('')

  // 获取应用版本号
  useEffect(() => {
    window.electronAPI
      .getAppVersion()
      .then(v => setVersion(v))
      .catch(() => {})
  }, [])

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

      <nav className="workspace-sidebar__nav" aria-label="main-navigation">
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'workspace' ? 'is-active' : ''}`}
          onClick={() => onViewChange('workspace')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <LayoutDashboard size={16} />
          {t("sidebar.notes")}
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'backlinks' ? 'is-active' : ''}`}
          onClick={() => onViewChange('backlinks')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link2 size={16} />
          {t("sidebar.backlinks")}
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'search' ? 'is-active' : ''}`}
          onClick={() => onViewChange('search')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Search size={16} />
          {t("sidebar.search")}
        </motion.button>
      </nav>

      <div style={{ flex: 1 }} />

      {/* 快速统计 - 放在底部操作区上方 */}
      <div className="sidebar-stats">
        <div className="sidebar-stats__title">{t("sidebar.stats.title")}</div>
        <div className="sidebar-stat">
          <Zap size={13} className="sidebar-stat__icon sidebar-stat__icon--active" />
          <span className="sidebar-stat__label">{t("sidebar.stats.running")}</span>
          <span className="sidebar-stat__value">{runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <Clock size={13} className="sidebar-stat__icon sidebar-stat__icon--queued" />
          <span className="sidebar-stat__label">{t("sidebar.stats.queued")}</span>
          <span className="sidebar-stat__value">{activeTasks.length - runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <CheckCircle2 size={13} className="sidebar-stat__icon sidebar-stat__icon--done" />
          <span className="sidebar-stat__label">{t("sidebar.stats.done")}</span>
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
          {t("sidebar.settings")}
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
          {t("sidebar.about")}
        </motion.button>
      </div>

      {version && (
        <div className="workspace-sidebar__version">v{version}</div>
      )}
    </aside>
  )
}
