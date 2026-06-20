import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Users, FolderOpen, Lightbulb, Bookmark, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Search } from 'lucide-react'

// ── Entity type metadata ──

const TYPE_META: Record<string, { icon: typeof Users; label: string; color: string }> = {
  people: { icon: Users, label: '人物', color: 'var(--accent)' },
  projects: { icon: FolderOpen, label: '项目', color: 'var(--success)' },
  concepts: { icon: Lightbulb, label: '概念', color: 'var(--warning)' },
  terms: { icon: Bookmark, label: '术语', color: 'var(--text-muted)' },
}

// ── Co-occurrence computation ──

interface CoEntity {
  name: string
  type: string
  count: number
}

function computeCoEntities(
  index: BacklinkEntry[],
  selectedEntity: string
): CoEntity[] {
  const target = index.find(e => e.entityName === selectedEntity)
  if (!target) return []

  const targetPaths = new Set(target.podcastRefs.map(r => r.path))
  const coMap = new Map<string, { type: string; count: number }>()

  for (const entry of index) {
    if (entry.entityName === selectedEntity) continue
    let overlap = 0
    for (const ref of entry.podcastRefs) {
      if (targetPaths.has(ref.path)) overlap++
    }
    if (overlap > 0) {
      coMap.set(entry.entityName, { type: entry.entityType, count: overlap })
    }
  }

  return Array.from(coMap.entries())
    .map(([name, { type, count }]) => ({ name, type, count }))
    .sort((a, b) => b.count - a.count)
}

// ── Component ──

export default function BacklinkPanel() {
  const [index, setIndex] = useState<BacklinkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAllCo, setShowAllCo] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.getBacklinkIndex().then(data => {
      if (!cancelled) { setIndex(data || []); setLoading(false) }
    }).catch(() => {
      if (!cancelled) { setIndex([]); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    try {
      const data = await window.electronAPI.getBacklinkIndex()
      setIndex(data || [])
    } catch {
      setIndex([])
    } finally {
      setLoading(false)
    }
  }

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return index
    const q = searchQuery.toLowerCase()
    return index.filter(e => e.entityName.toLowerCase().includes(q))
  }, [index, searchQuery])

  // Stats
  const totalEntities = index.length
  const totalLinks = index.reduce((sum, e) => sum + e.podcastRefs.length, 0)

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    setShowAllCo(false)
  }

  const openNote = (path: string) => {
    window.electronAPI.openPath(path).then(ok => {
      if (!ok) alert('笔记文件不存在，可能已被移动或删除')
    })
  }

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    window.electronAPI.showInFolder(path)
  }

  // Currently selected entity (first expanded)
  const selectedEntity = expanded.size > 0 ? Array.from(expanded)[expanded.size - 1] : null
  const coEntities = useMemo(() => {
    if (!selectedEntity) return []
    return computeCoEntities(index, selectedEntity)
  }, [index, selectedEntity])

  const displayedCo = showAllCo ? coEntities : coEntities.slice(0, 5)

  // Category label color
  const CATEGORY_COLORS: Record<string, string> = {
    '科技商业': 'var(--accent)',
    '每日资讯': 'var(--success)',
    '社会心理': '#ec4899',
    '生活文化': '#f59e0b',
  }

  if (loading) {
    return (
      <div className="backlink-panel">
        <div className="backlink-panel__header">
          <h2 className="backlink-panel__title">知识关联</h2>
        </div>
        <div className="backlink-panel__loading">
          <RefreshCw size={16} className="backlink-panel__spin" />
          <span>正在扫描知识网络…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="backlink-panel">
      {/* Header */}
      <div className="backlink-panel__header">
        <h2 className="backlink-panel__title">知识关联</h2>
        <button className="backlink-panel__refresh" onClick={handleRefresh} title="刷新索引">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Stats bar */}
      <div className="backlink-panel__stats">
        <span className="backlink-panel__stat">
          <strong>{totalEntities}</strong> 个实体
        </span>
        <span className="backlink-panel__stat-sep">·</span>
        <span className="backlink-panel__stat">
          <strong>{totalLinks}</strong> 条关联
        </span>
      </div>

      {/* Search */}
      <div className="backlink-panel__search">
        <Search size={13} className="backlink-panel__search-icon" />
        <input
          type="text"
          className="backlink-panel__search-input"
          placeholder="搜索实体…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="backlink-panel__empty">
          {index.length === 0 ? (
            <>
              <Lightbulb size={24} style={{ opacity: 0.3 }} />
              <p>处理更多播客后将在此展示知识关联</p>
              <p className="backlink-panel__empty-hint">
                同一实体出现在多期节目中时，会自动建立关联
              </p>
            </>
          ) : (
            <p>未找到匹配的实体</p>
          )}
        </div>
      )}

      {/* Entity list */}
      <div className="backlink-panel__list">
        {filtered.map(entry => {
          const meta = TYPE_META[entry.entityType] || TYPE_META.concepts
          const Icon = meta.icon
          const isOpen = expanded.has(entry.entityName)

          return (
            <div key={`${entry.entityType}-${entry.entityName}`} className="backlink-entity">
              <motion.button
                className={`backlink-entity__header ${isOpen ? 'is-open' : ''}`}
                onClick={() => toggleExpand(entry.entityName)}
                whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <Icon size={14} style={{ color: meta.color }} />
                <span className="backlink-entity__name">{entry.entityName}</span>
                <span className="backlink-entity__badge">{entry.podcastRefs.length}</span>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </motion.button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="backlink-entity__body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {/* Podcast refs */}
                    {entry.podcastRefs.map(ref => (
                      <div
                        key={ref.path}
                        className="backlink-podcast"
                        onClick={() => openNote(ref.path)}
                        onContextMenu={e => handleContextMenu(e, ref.path)}
                      >
                        <div className="backlink-podcast__title">
                          <ExternalLink size={11} className="backlink-podcast__link-icon" />
                          {ref.show ? (
                            <>
                              <span className="backlink-podcast__show">{ref.show}</span>
                              <span className="backlink-podcast__sep">·</span>
                            </>
                          ) : null}
                          <span className="backlink-podcast__name">{ref.title}</span>
                        </div>
                        <div className="backlink-podcast__meta">
                          {ref.date && <span className="backlink-podcast__date">{ref.date}</span>}
                          {ref.category && (
                            <span
                              className="backlink-podcast__category"
                              style={{ color: CATEGORY_COLORS[ref.category] || 'var(--text-muted)' }}
                            >
                              {ref.category}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Co-occurrence section (only for the selected entity) */}
                    {selectedEntity === entry.entityName && coEntities.length > 0 && (
                      <div className="backlink-co">
                        <div className="backlink-co__title">共现实体</div>
                        {displayedCo.map(co => {
                          const coMeta = TYPE_META[co.type] || TYPE_META.concepts
                          const CoIcon = coMeta.icon
                          return (
                            <button
                              key={co.name}
                              className="backlink-co__item"
                              onClick={() => {
                                setExpanded(new Set([co.name]))
                                setShowAllCo(false)
                              }}
                            >
                              <CoIcon size={12} style={{ color: coMeta.color }} />
                              <span>{co.name}</span>
                              <span className="backlink-co__count">{co.count}</span>
                            </button>
                          )
                        })}
                        {!showAllCo && coEntities.length > 5 && (
                          <button
                            className="backlink-co__more"
                            onClick={() => setShowAllCo(true)}
                          >
                            查看更多（{coEntities.length - 5}）
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Type legend */}
      <div className="backlink-panel__legend">
        {Object.entries(TYPE_META).map(([type, { icon: Icon, label, color }]) => {
          const count = index.filter(e => e.entityType === type).length
          return (
            <span key={type} className="backlink-panel__legend-item">
              <Icon size={10} style={{ color }} />
              {label} {count}
            </span>
          )
        })}
      </div>

      <style>{`
        .backlink-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .backlink-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 20px 0;
        }

        .backlink-panel__title {
          font-size: var(--fs-xl);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .backlink-panel__refresh {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .backlink-panel__refresh:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        .backlink-panel__stats {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px 0;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .backlink-panel__stat strong {
          color: var(--text-primary);
          font-weight: 600;
        }
        .backlink-panel__stat-sep {
          color: var(--text-muted);
        }

        .backlink-panel__search {
          position: relative;
          padding: 12px 20px;
        }
        .backlink-panel__search-icon {
          position: absolute;
          left: 30px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }
        .backlink-panel__search-input {
          width: 100%;
          padding: 7px 10px 7px 30px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: var(--fs-base);
          outline: none;
          transition: border-color 0.15s;
        }
        .backlink-panel__search-input:focus {
          border-color: var(--accent);
        }
        .backlink-panel__search-input::placeholder {
          color: var(--text-muted);
        }

        .backlink-panel__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 40px 20px;
          text-align: center;
          color: var(--text-muted);
          font-size: var(--fs-base);
        }
        .backlink-panel__empty-hint {
          font-size: var(--fs-sm);
          opacity: 0.6;
          margin: 0;
        }

        .backlink-panel__loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 40px 20px;
          color: var(--text-muted);
          font-size: var(--fs-base);
        }
        .backlink-panel__spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .backlink-panel__list {
          flex: 1;
          overflow-y: auto;
          padding: 0 12px 12px;
        }

        /* Entity item */
        .backlink-entity {
          margin-bottom: 2px;
        }
        .backlink-entity__header {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-primary);
          font-size: var(--fs-base);
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
        }
        .backlink-entity__header:hover {
          background: var(--bg-elevated);
        }
        .backlink-entity__header.is-open {
          background: var(--bg-elevated);
        }
        .backlink-entity__name {
          flex: 1;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .backlink-entity__badge {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: var(--accent);
          color: #fff;
          font-size: 10px;
          font-weight: 600;
        }

        .backlink-entity__body {
          overflow: hidden;
          padding-left: 30px;
        }

        /* Podcast ref item */
        .backlink-podcast {
          padding: 8px 10px;
          margin: 2px 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.1s;
        }
        .backlink-podcast:hover {
          background: var(--bg-surface);
        }
        .backlink-podcast__title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: var(--fs-base);
          color: var(--text-primary);
          line-height: 1.4;
        }
        .backlink-podcast__link-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .backlink-podcast__show {
          color: var(--accent);
          font-weight: 500;
        }
        .backlink-podcast__sep {
          color: var(--text-muted);
        }
        .backlink-podcast__name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .backlink-podcast__meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
        .backlink-podcast__date {
          opacity: 0.7;
        }
        .backlink-podcast__category {
          font-weight: 500;
        }

        /* Co-occurrence */
        .backlink-co {
          margin-top: 8px;
          padding: 10px;
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          border: 1px solid var(--border);
        }
        .backlink-co__title {
          font-size: var(--fs-xs);
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .backlink-co__item {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 4px 6px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-primary);
          font-size: var(--fs-sm);
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
        }
        .backlink-co__item:hover {
          background: var(--bg-elevated);
        }
        .backlink-co__count {
          margin-left: auto;
          color: var(--text-muted);
          font-size: var(--fs-xs);
        }
        .backlink-co__more {
          display: block;
          width: 100%;
          padding: 4px;
          margin-top: 4px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--accent);
          font-size: var(--fs-xs);
          cursor: pointer;
          text-align: center;
          transition: background 0.1s;
        }
        .backlink-co__more:hover {
          background: var(--bg-elevated);
        }

        /* Legend */
        .backlink-panel__legend {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 20px 12px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
          border-top: 1px solid var(--border-soft);
        }
        .backlink-panel__legend-item {
          display: flex;
          align-items: center;
          gap: 3px;
        }
      `}</style>
    </div>
  )
}
