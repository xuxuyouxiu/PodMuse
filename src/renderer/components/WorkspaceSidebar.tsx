import { motion } from 'motion/react'
import { Settings, Info } from 'lucide-react'

interface Props {
  onSettings: () => void
  onAbout: () => void
}

export default function WorkspaceSidebar({ onSettings, onAbout }: Props) {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__brand">
        <img className="workspace-sidebar__logo" src="./icon.png" alt="播客笔记助手" />
        <div>
          <div className="workspace-sidebar__title">播客笔记助手</div>
          <div className="workspace-sidebar__subtitle">Workspace</div>
        </div>
      </div>

      <nav className="workspace-sidebar__nav" aria-label="工作台导航">
        <motion.button
          type="button"
          className="workspace-sidebar__nav-item is-active"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          工作台
        </motion.button>
      </nav>

      <div className="workspace-sidebar__system-ops" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
