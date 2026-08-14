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
  BookOpen,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Rss,
  History,
  Coffee,
} from 'lucide-react'
import { RecentTaskState } from '@shared/types'
import { useI18n } from '../i18n'
import UpdateDialog from './UpdateDialog'
import DonateDialog from './DonateDialog'

export type SidebarView = 'workspace' | 'notes' | 'backlinks' | 'search' | 'qa' | 'subscription' | 'history'

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
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ phase: 'idle' })
  const [updateOpen, setUpdateOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  // ChatGPT 式侧栏：默认收缩为图标窄栏，点击展开完整侧栏
  const [expanded, setExpanded] = useState(true)

  // 获取应用版本号
  useEffect(() => {
    window.electronAPI
      .getAppVersion()
      .then(v => setVersion(v))
      .catch(() => {})
  }, [])

  // 订阅自动更新状态
  useEffect(() => {
    const off = window.electronAPI.onUpdaterState(state => setUpdaterState(state))
    return () => off()
  }, [])

  const hasUpdate =
    updaterState.phase === 'available' ||
    updaterState.phase === 'downloading' ||
    updaterState.phase === 'downloaded'

  const runningCount = activeTasks.filter(t => t.status === 'running').length
  const completedToday = recentTasks.filter(t => {
    if (t.status !== 'completed') return false
    const d = new Date(t.updatedAt)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  return (
    <aside className={`workspace-sidebar ${expanded ? "is-expanded" : ""}`}>
      <div className="workspace-sidebar__brand">
        <img className="workspace-sidebar__logo" src="./icon.png" alt="PodMuse" />
        <div className="ws-label">
          <div className="workspace-sidebar__title">PodMuse</div>
          <div className="workspace-sidebar__subtitle">Workspace</div>
        </div>
        <button
          type="button"
          className="workspace-sidebar__collapse-btn"
          onClick={() => setExpanded(false)}
          title={t('收起侧边栏')}
        >
          <PanelLeftClose size={14} />
        </button>
        <button
          type="button"
          className="workspace-sidebar__expand-btn"
          onClick={() => setExpanded(true)}
          title={t('展开侧边栏')}
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>

      <nav className="workspace-sidebar__nav" aria-label="main-navigation">
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'notes' ? 'is-active' : ''}`}
          onClick={() => onViewChange('notes')}
          title={t("笔记库")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <BookOpen size={16} />
          <span className="ws-label">{t("笔记库")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'workspace' ? 'is-active' : ''}`}
          onClick={() => onViewChange('workspace')}
          title={t("工作台")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <LayoutDashboard size={16} />
          <span className="ws-label">{t("工作台")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'subscription' ? 'is-active' : ''}`}
          onClick={() => onViewChange('subscription')}
          title={t("订阅")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Rss size={16} />
          <span className="ws-label">{t("订阅")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'history' ? 'is-active' : ''}`}
          onClick={() => onViewChange('history')}
          title={t("历史")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <History size={16} />
          <span className="ws-label">{t("历史")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'backlinks' ? 'is-active' : ''}`}
          onClick={() => onViewChange('backlinks')}
          title={t("知识关联")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link2 size={16} />
          <span className="ws-label">{t("知识关联")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'search' ? 'is-active' : ''}`}
          onClick={() => onViewChange('search')}
          title={t("搜索")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Search size={16} />
          <span className="ws-label">{t("搜索")}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`workspace-sidebar__nav-item ${activeView === 'qa' ? 'is-active' : ''}`}
          onClick={() => onViewChange('qa')}
          title={t("问答")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <MessageSquareText size={16} />
          <span className="ws-label">{t("问答")}</span>
        </motion.button>
      </nav>

      <div style={{ flex: 1 }} />

      {/* 快速统计 - 放在底部操作区上方 */}
      <div className="sidebar-stats ws-label">
        <div className="sidebar-stats__title">{t("任务概览")}</div>
        <div className="sidebar-stat">
          <Zap size={13} className="sidebar-stat__icon sidebar-stat__icon--active" />
          <span className="sidebar-stat__label">{t("进行中")}</span>
          <span className="sidebar-stat__value">{runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <Clock size={13} className="sidebar-stat__icon sidebar-stat__icon--queued" />
          <span className="sidebar-stat__label">{t("排队中")}</span>
          <span className="sidebar-stat__value">{activeTasks.length - runningCount}</span>
        </div>
        <div className="sidebar-stat">
          <CheckCircle2 size={13} className="sidebar-stat__icon sidebar-stat__icon--done" />
          <span className="sidebar-stat__label">{t("今日完成")}</span>
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
          title={t('设置')}
          style={{ gap: '10px' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Settings size={16} />
          <span className="ws-label">{t("设置")}</span>
        </motion.button>
        <motion.button
          type="button"
          className="workspace-sidebar__nav-item"
          onClick={onAbout}
          title={t('关于')}
          style={{ gap: '10px' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Info size={16} />
          <span className="ws-label">{t("关于")}</span>
        </motion.button>
        <motion.button
          type="button"
          className="workspace-sidebar__nav-item workspace-sidebar__nav-item--donate"
          onClick={() => setDonateOpen(true)}
          title={t('请我喝杯咖啡')}
          style={{ gap: '10px' }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Coffee size={16} />
          <span className="ws-label">{t("请我喝杯咖啡")}</span>
        </motion.button>
      </div>

      {version && (
        <button
          type="button"
          className={`workspace-sidebar__version ws-label ${hasUpdate ? 'is-update' : ''}`}
          onClick={() => setUpdateOpen(true)}
          title={hasUpdate ? t('有新版本可用') : t('检查更新')}
        >
          v{version}
          {hasUpdate && <span className="workspace-sidebar__version-badge">(1)</span>}
        </button>
      )}
      {updateOpen && (
        <UpdateDialog
          state={updaterState}
          currentVersion={version}
          onClose={() => setUpdateOpen(false)}
          onDownload={() => window.electronAPI.updaterDownload()}
          onInstall={() => window.electronAPI.updaterInstall()}
          onManualCheck={() => window.electronAPI.updaterManualCheck()}
        />
      )}
      {donateOpen && <DonateDialog onClose={() => setDonateOpen(false)} />}
    </aside>
  )
}
