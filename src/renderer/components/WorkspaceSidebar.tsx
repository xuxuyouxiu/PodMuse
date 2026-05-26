interface Props {
  onSettings: () => void
  onAbout: () => void
}

export default function WorkspaceSidebar({ onSettings, onAbout }: Props) {
  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar__brand">
        <div className="workspace-sidebar__logo">PA</div>
        <div>
          <div className="workspace-sidebar__title">播客笔记助手</div>
          <div className="workspace-sidebar__subtitle">Workspace</div>
        </div>
      </div>

      <nav className="workspace-sidebar__nav" aria-label="工作台导航">
        <button type="button" className="workspace-sidebar__nav-item is-active">
          工作台
        </button>
        <button type="button" className="workspace-sidebar__nav-item">
          最近任务
        </button>
      </nav>

      <div className="workspace-sidebar__system-ops" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button type="button" className="workspace-sidebar__nav-item" onClick={onSettings} style={{ gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          设置
        </button>
        <button type="button" className="workspace-sidebar__nav-item" onClick={onAbout} style={{ gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
          关于
        </button>
      </div>
    </aside>
  )
}
