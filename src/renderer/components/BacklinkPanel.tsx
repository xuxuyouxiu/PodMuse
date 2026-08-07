import { useState, useEffect, useMemo } from 'react'
import {
  Users,
  FolderOpen,
  Lightbulb,
  Bookmark,
  RefreshCw,
  Search,
  ChevronRight,
  X,
  Check,
  Network,
} from 'lucide-react'

import { useI18n } from '../i18n'

// ── Entity type metadata ──

const TYPE_META: Record<string, { icon: typeof Users; label: string; color: string }> = {
  people: { icon: Users, label: '人物', color: 'var(--accent)' },
  projects: { icon: FolderOpen, label: '项目', color: 'var(--success)' },
  concepts: { icon: Lightbulb, label: '概念', color: 'var(--warning)' },
  terms: { icon: Bookmark, label: '术语', color: 'var(--text-muted)' },
}

const TYPE_ORDER = ['people', 'projects', 'concepts', 'terms'] as const

// ── Co-occurrence computation ──

interface CoEntity {
  name: string
  type: string
  count: number
}

function computeCoEntities(index: BacklinkEntry[], selectedEntity: string): CoEntity[] {
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

// ── Graph computation ──

interface GraphNode {
  name: string
  type: string
  refCount: number
  x: number
  y: number
  radius: number
}

interface GraphEdge {
  source: string
  target: string
  count: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function computeGraph(
  index: BacklinkEntry[],
  selectedEntity: string,
  width: number,
  height: number,
): GraphData {
  const target = index.find(e => e.entityName === selectedEntity)
  if (!target) return { nodes: [], edges: [] }

  const coEntities = computeCoEntities(index, selectedEntity)
  // Limit to top 15 co-entities for readability
  const topCo = coEntities.slice(0, 15)

  const centerX = width / 2
  const centerY = height / 2
  const orbitRadius = Math.min(width, height) * 0.35

  // Center node (selected entity)
  const centerRef = target.podcastRefs.length
  const centerRadius = Math.max(12, Math.min(24, 8 + centerRef * 2))

  const nodes: GraphNode[] = [
    {
      name: selectedEntity,
      type: target.entityType,
      refCount: centerRef,
      x: centerX,
      y: centerY,
      radius: centerRadius,
    },
  ]

  // Surrounding nodes arranged in a circle
  const angleStep = topCo.length > 0 ? (2 * Math.PI) / topCo.length : 0
  topCo.forEach((co, i) => {
    const angle = angleStep * i - Math.PI / 2 // start from top
    const entry = index.find(e => e.entityName === co.name)
    const refCount = entry ? entry.podcastRefs.length : 1
    const radius = Math.max(8, Math.min(18, 6 + refCount * 2))

    nodes.push({
      name: co.name,
      type: co.type,
      refCount,
      x: centerX + orbitRadius * Math.cos(angle),
      y: centerY + orbitRadius * Math.sin(angle),
      radius,
    })
  })

  // Edges from center to each co-entity
  const edges: GraphEdge[] = topCo.map(co => ({
    source: selectedEntity,
    target: co.name,
    count: co.count,
  }))

  // Edges between co-entities that share podcasts
  for (let i = 0; i < topCo.length; i++) {
    for (let j = i + 1; j < topCo.length; j++) {
      const a = topCo[i]
      const b = topCo[j]
      const entryA = index.find(e => e.entityName === a.name)
      const entryB = index.find(e => e.entityName === b.name)
      if (!entryA || !entryB) continue

      const pathsA = new Set(entryA.podcastRefs.map(r => r.path))
      let overlap = 0
      for (const ref of entryB.podcastRefs) {
        if (pathsA.has(ref.path)) overlap++
      }
      if (overlap > 0) {
        edges.push({ source: a.name, target: b.name, count: overlap })
      }
    }
  }

  return { nodes, edges }
}

// ── Sentence-level diff ──

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？.!?]\s*)/).filter(s => s.trim().length > 0)
}

interface DiffSegment {
  text: string
  type: 'common' | 'added' | 'removed'
}

function computeSentenceDiff(older: string, newer: string): DiffSegment[] {
  const oldSentences = splitSentences(older)
  const newSentences = splitSentences(newer)

  const oldSet = new Set(oldSentences.map(s => s.trim()))
  const newSet = new Set(newSentences.map(s => s.trim()))

  const segments: DiffSegment[] = []

  for (const sentence of newSentences) {
    const trimmed = sentence.trim()
    if (oldSet.has(trimmed)) {
      segments.push({ text: sentence, type: 'common' })
    } else {
      segments.push({ text: sentence, type: 'added' })
    }
  }

  for (const sentence of oldSentences) {
    const trimmed = sentence.trim()
    if (!newSet.has(trimmed)) {
      segments.push({ text: sentence, type: 'removed' })
    }
  }

  return segments
}

// ── Component ──

export default function BacklinkPanel() {
  const { t } = useI18n()
  const [index, setIndex] = useState<BacklinkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<string>('people')
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [showAllCo, setShowAllCo] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelections, setCompareSelections] = useState<Set<string>>(new Set())
  const [graphMode, setGraphMode] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Tag view state
  const [topView, setTopView] = useState<'entities' | 'tags'>('entities')
  const [tagIndex, setTagIndex] = useState<TagEntry[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getBacklinkIndex()
      .then(data => {
        if (!cancelled) {
          setIndex(data || [])
          setLoading(false)
          const first = (data || []).find(e => e.entityType === 'people')
          if (first) setSelectedEntity(first.entityName)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIndex([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    try {
      const data = await window.electronAPI.getBacklinkIndex()
      setIndex(data || [])
      // Also refresh tag index
      const tags = await window.electronAPI.getTagIndex()
      setTagIndex(tags || [])
    } catch {
      setIndex([])
      setTagIndex([])
    } finally {
      setLoading(false)
    }
  }

  const totalEntities = index.length
  const totalLinks = index.reduce((sum, e) => sum + e.podcastRefs.length, 0)

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const type of TYPE_ORDER) counts[type] = 0
    for (const entry of index) {
      if (counts[entry.entityType] !== undefined) counts[entry.entityType]++
    }
    return counts
  }, [index])

  const filteredEntities = useMemo(() => {
    let list = index.filter(e => e.entityType === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e => e.entityName.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => b.podcastRefs.length - a.podcastRefs.length)
  }, [index, activeTab, searchQuery])

  const selectedEntry = useMemo(() => {
    if (!selectedEntity) return null
    return index.find(e => e.entityName === selectedEntity) || null
  }, [index, selectedEntity])

  const coEntities = useMemo(() => {
    if (!selectedEntity) return []
    return computeCoEntities(index, selectedEntity)
  }, [index, selectedEntity])

  const displayedCo = showAllCo ? coEntities : coEntities.slice(0, 5)

  // Compare mode: selected refs
  const compareRefs = useMemo(() => {
    if (!selectedEntry) return []
    return selectedEntry.podcastRefs.filter(ref => compareSelections.has(ref.path))
  }, [selectedEntry, compareSelections])

  // Graph data computation
  const graphData = useMemo(() => {
    if (!selectedEntity || !graphMode) return { nodes: [], edges: [] }
    return computeGraph(index, selectedEntity, 400, 320)
  }, [index, selectedEntity, graphMode])

  // ── Tag view computed values ──

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      科技商业: 0,
      每日资讯: 0,
      社会心理: 0,
      生活文化: 0,
    }
    const seen = new Set<string>()
    for (const tag of tagIndex) {
      for (const ref of tag.podcastRefs) {
        if (ref.category && counts[ref.category] !== undefined && !seen.has(ref.path)) {
          seen.add(ref.path)
          counts[ref.category]++
        }
      }
    }
    return counts
  }, [tagIndex])

  const filteredTagIndex = useMemo(() => {
    if (!activeCategory) return tagIndex
    return tagIndex
      .map(tag => ({
        ...tag,
        podcastRefs: tag.podcastRefs.filter(r => r.category === activeCategory),
      }))
      .filter(tag => tag.podcastRefs.length > 0)
      .sort((a, b) => b.podcastRefs.length - a.podcastRefs.length)
  }, [tagIndex, activeCategory])

  const selectedTagEntry = useMemo(() => {
    if (!selectedTag) return null
    return tagIndex.find(t => t.tagName === selectedTag) || null
  }, [tagIndex, selectedTag])

  const maxTagCount = useMemo(() => {
    return tagIndex.length > 0 ? tagIndex[0].count : 1
  }, [tagIndex])

  function getTagFontSize(count: number): number {
    const min = 12,
      max = 22
    const ratio = maxTagCount > 0 ? count / maxTagCount : 0
    return Math.round(min + (max - min) * ratio)
  }

  function handleTagClick(tagName: string) {
    setSelectedTag(prev => (prev === tagName ? null : tagName))
  }

  function handleCategoryClick(cat: string) {
    setActiveCategory(prev => (prev === cat ? null : cat))
    setSelectedTag(null)
  }

  // Related notes recommendation (US-003)
  function findRelatedNotes(
    targetPath: string,
    targetTags: string[],
  ): { path: string; title: string; date?: string; sharedTags: string[]; similarity: number }[] {
    const seen = new Map<
      string,
      { path: string; title: string; date?: string; sharedTags: string[]; similarity: number }
    >()

    for (const tag of tagIndex) {
      if (!targetTags.includes(tag.tagName)) continue
      for (const ref of tag.podcastRefs) {
        if (ref.path === targetPath) continue
        const shared = ref.tags.filter(t => targetTags.includes(t))
        const union = new Set([...targetTags, ...ref.tags]).size
        const similarity = union > 0 ? shared.length / union : 0
        const existing = seen.get(ref.path)
        if (!existing || similarity > existing.similarity) {
          seen.set(ref.path, {
            path: ref.path,
            title: ref.title,
            date: ref.date,
            sharedTags: shared,
            similarity,
          })
        }
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
  }

  function handleTabChange(type: string) {
    setActiveTab(type)
    setShowAllCo(false)
    setCompareMode(false)
    setCompareSelections(new Set())
    setGraphMode(false)
    setHoveredNode(null)
    const first = index.find(e => e.entityType === type)
    if (first) setSelectedEntity(first.entityName)
    else setSelectedEntity(null)
  }

  function handleEntityClick(name: string) {
    setSelectedEntity(name)
    setShowAllCo(false)
    setCompareMode(false)
    setCompareSelections(new Set())
    setGraphMode(false)
    setHoveredNode(null)
  }

  function handleCoEntityClick(name: string, type: string) {
    if (type !== activeTab) setActiveTab(type)
    setSelectedEntity(name)
    setShowAllCo(false)
    setCompareMode(false)
    setCompareSelections(new Set())
    setGraphMode(false)
    setHoveredNode(null)
  }

  function toggleCompareMode() {
    setCompareMode(!compareMode)
    setCompareSelections(new Set())
  }

  function toggleCompareSelection(path: string) {
    setCompareSelections(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        if (next.size < 3) next.add(path)
      }
      return next
    })
  }

  function toggleGraphMode() {
    setGraphMode(!graphMode)
    setHoveredNode(null)
  }

  function handleGraphNodeClick(name: string) {
    const entry = index.find(e => e.entityName === name)
    if (!entry) return
    if (entry.entityType !== activeTab) setActiveTab(entry.entityType)
    setSelectedEntity(name)
    setGraphMode(false)
    setHoveredNode(null)
  }

  const openNote = (path: string) => {
    window.electronAPI.openPath(path).then(ok => {
      if (!ok) alert(t('笔记文件不存在，可能已被移动或删除'))
    })
  }

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    window.electronAPI.showInFolder(path)
  }

  const CATEGORY_COLORS: Record<string, string> = {
    科技商业: 'var(--accent)',
    每日资讯: 'var(--success)',
    社会心理: '#ec4899',
    生活文化: '#f59e0b',
  }

  if (loading) {
    return (
      <div className="backlink-panel">
        <div className="backlink-panel__header">
          <h2 className="backlink-panel__title">{t('知识关联')}</h2>
        </div>
        <div className="backlink-panel__loading">
          <RefreshCw size={16} className="backlink-panel__spin" />
          <span>{t('正在扫描知识网络…')}</span>
        </div>
        <style>{`
          .backlink-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
          .backlink-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 0; }
          .backlink-panel__title { font-size: var(--fs-xl); font-weight: 700; color: var(--text-primary); margin: 0; }
          .backlink-panel__loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--text-muted); font-size: var(--fs-base); }
          .backlink-panel__spin { animation: bl-spin 1s linear infinite; }
          @keyframes bl-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="backlink-panel">
      {/* Header */}
      <div className="backlink-panel__header">
        <h2 className="backlink-panel__title">{t('知识关联')}</h2>
        <div className="backlink-panel__topview">
          <button
            className={`backlink-topview__btn ${topView === 'entities' ? 'is-active' : ''}`}
            onClick={() => setTopView('entities')}
          >
            {t('实体')}
          </button>
          <button
            className={`backlink-topview__btn ${topView === 'tags' ? 'is-active' : ''}`}
            onClick={() => {
              setTopView('tags')
              if (tagIndex.length === 0) {
                window.electronAPI.getTagIndex().then(data => setTagIndex(data || []))
              }
            }}
          >
            {t('标签')}
          </button>
        </div>
        <button className="backlink-panel__refresh" onClick={handleRefresh} title={t('刷新索引')}>
          <RefreshCw size={14} />
        </button>
      </div>

      {topView === 'tags' ? (
        <>
          {/* Category overview */}
          <div className="tag-category-overview">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <button
                key={cat}
                className={`tag-category-card ${activeCategory === cat ? 'is-active' : ''}`}
                style={{
                  borderColor: activeCategory === cat ? CATEGORY_COLORS[cat] : 'transparent',
                }}
                onClick={() => handleCategoryClick(cat)}
              >
                <span className="tag-category-card__name">{cat}</span>
                <span className="tag-category-card__count">{count}</span>
              </button>
            ))}
          </div>

          {/* Tag cloud */}
          <div className="tag-cloud">
            {filteredTagIndex.length === 0 ? (
              <div className="tag-cloud__empty">
                {tagIndex.length === 0 ? t('暂无标签数据') : t('该分类下无标签')}
              </div>
            ) : (
              filteredTagIndex.map(tag => (
                <button
                  key={tag.tagName}
                  className={`tag-cloud__item ${selectedTag === tag.tagName ? 'is-active' : ''}`}
                  style={{ fontSize: getTagFontSize(tag.count) }}
                  onClick={() => handleTagClick(tag.tagName)}
                >
                  {tag.tagName}
                  <span className="tag-cloud__count">{tag.count}</span>
                </button>
              ))
            )}
          </div>

          {/* Selected tag detail */}
          {selectedTagEntry && (
            <div className="tag-detail">
              <div className="tag-detail__header">
                <h3 className="tag-detail__title">{selectedTagEntry.tagName}</h3>
                <span className="tag-detail__count">{selectedTagEntry.count} {t('篇笔记')}</span>
              </div>
              <div className="tag-detail__list">
                {selectedTagEntry.podcastRefs
                  .filter(r => !activeCategory || r.category === activeCategory)
                  .map(ref => {
                    const related = findRelatedNotes(ref.path, ref.tags)
                    return (
                      <div key={ref.path} className="tag-detail__item">
                        <div
                          className="tag-detail__item-main"
                          onClick={() => openNote(ref.path)}
                          onContextMenu={e => handleContextMenu(e, ref.path)}
                        >
                          <span className="tag-detail__item-title">{ref.title}</span>
                          <div className="tag-detail__item-meta">
                            {ref.date && <span>{ref.date}</span>}
                            {ref.show && <span>{ref.show}</span>}
                            {ref.category && (
                              <span style={{ color: CATEGORY_COLORS[ref.category] || 'inherit' }}>
                                {ref.category}
                              </span>
                            )}
                          </div>
                          <div className="tag-detail__item-tags">
                            {ref.tags.map(t => (
                              <span
                                key={t}
                                className={`tag-detail__tag ${t === selectedTag ? 'is-highlight' : ''}`}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        {related.length > 0 && (
                          <div className="tag-detail__related">
                            <span className="tag-detail__related-label">{t('相关笔记')}</span>
                            {related.map(r => (
                              <button
                                key={r.path}
                                className="tag-detail__related-item"
                                onClick={() => openNote(r.path)}
                                onContextMenu={e => handleContextMenu(e, r.path)}
                              >
                                <span>{r.title}</span>
                                <span className="tag-detail__related-shared">
                                  {r.sharedTags.length} {t('个共同标签')}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Stats bar */}
          <div className="backlink-panel__stats">
            <span className="backlink-panel__stat">
              <strong>{totalEntities}</strong> {t('个实体')}
            </span>
            <span className="backlink-panel__stat-sep">·</span>
            <span className="backlink-panel__stat">
              <strong>{totalLinks}</strong> {t('条关联')}
            </span>
          </div>

          {/* Search */}
          <div className="backlink-panel__search">
            <Search size={13} className="backlink-panel__search-icon" />
            <input
              type="text"
              className="backlink-panel__search-input"
              placeholder={t('搜索当前分类…')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div className="backlink-tabs">
            {TYPE_ORDER.map(type => {
              const meta = TYPE_META[type]
              const Icon = meta.icon
              const isActive = activeTab === type
              return (
                <button
                  key={type}
                  className={`backlink-tab ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleTabChange(type)}
                >
                  <Icon size={12} style={{ color: meta.color }} />
                  <span className="backlink-tab__label">{t(meta.label)}</span>
                  <span className="backlink-tab__count">{typeCounts[type]}</span>
                </button>
              )
            })}
          </div>

          {/* Split: entity list + detail */}
          <div className="backlink-split">
            {/* Left: entity list */}
            <div className="backlink-split__left">
              {filteredEntities.length === 0 ? (
                <div className="backlink-split__empty">
                  {index.length === 0 ? (
                    <>
                      <Lightbulb size={20} style={{ opacity: 0.3 }} />
                      <span>{t('处理播客后自动生成')}</span>
                    </>
                  ) : (
                    <span>{t('未找到匹配')}</span>
                  )}
                </div>
              ) : (
                filteredEntities.map(entry => {
                  const isActive = selectedEntity === entry.entityName
                  return (
                    <button
                      key={`${entry.entityType}-${entry.entityName}`}
                      className={`backlink-mini ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleEntityClick(entry.entityName)}
                    >
                      <span className="backlink-mini__name">{entry.entityName}</span>
                      <span className="backlink-mini__badge">{entry.podcastRefs.length}</span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Right: detail, compare, or graph view */}
            <div className="backlink-split__right">
              {selectedEntry ? (
                graphMode ? (
                  /* ── Graph View ── */
                  <div className="backlink-graph">
                    <div className="backlink-graph__header">
                      <span className="backlink-graph__title">{t('关系图谱')} · {selectedEntity}</span>
                      <button className="backlink-graph__close" onClick={toggleGraphMode}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="backlink-graph__canvas-wrap">
                      <svg
                        className="backlink-graph__svg"
                        viewBox="0 0 400 320"
                        width="100%"
                        height="100%"
                      >
                        {/* Edges */}
                        {graphData.edges.map((edge, i) => {
                          const sourceNode = graphData.nodes.find(n => n.name === edge.source)
                          const targetNode = graphData.nodes.find(n => n.name === edge.target)
                          if (!sourceNode || !targetNode) return null
                          const isHighlighted =
                            hoveredNode === edge.source || hoveredNode === edge.target
                          const thickness = Math.max(1, Math.min(4, edge.count))
                          return (
                            <line
                              key={`edge-${i}`}
                              x1={sourceNode.x}
                              y1={sourceNode.y}
                              x2={targetNode.x}
                              y2={targetNode.y}
                              stroke={isHighlighted ? 'var(--accent)' : 'var(--border)'}
                              strokeWidth={thickness}
                              opacity={isHighlighted ? 0.8 : 0.3}
                              className="backlink-graph__edge"
                            />
                          )
                        })}
                        {/* Nodes */}
                        {graphData.nodes.map(node => {
                          const meta = TYPE_META[node.type] || TYPE_META.concepts
                          const isCenter = node.name === selectedEntity
                          const isHovered = hoveredNode === node.name
                          const isConnected =
                            hoveredNode &&
                            graphData.edges.some(
                              e =>
                                (e.source === hoveredNode && e.target === node.name) ||
                                (e.target === hoveredNode && e.source === node.name),
                            )
                          const dimmed = hoveredNode && !isHovered && !isConnected && !isCenter
                          return (
                            <g
                              key={`node-${node.name}`}
                              className="backlink-graph__node"
                              style={{ cursor: 'pointer', opacity: dimmed ? 0.2 : 1 }}
                              onClick={() => handleGraphNodeClick(node.name)}
                              onMouseEnter={() => setHoveredNode(node.name)}
                              onMouseLeave={() => setHoveredNode(null)}
                            >
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.radius}
                                fill={isCenter ? 'var(--accent)' : 'var(--bg-card)'}
                                stroke={meta.color}
                                strokeWidth={isCenter ? 3 : 2}
                              />
                              <text
                                x={node.x}
                                y={node.y + node.radius + 14}
                                textAnchor="middle"
                                fill="var(--text-primary)"
                                fontSize={isCenter ? 11 : 10}
                                fontWeight={isCenter ? 600 : 400}
                              >
                                {node.name.length > 6 ? node.name.slice(0, 6) + '…' : node.name}
                              </text>
                              <text
                                x={node.x}
                                y={node.y + 4}
                                textAnchor="middle"
                                fill={isCenter ? '#fff' : 'var(--text-muted)'}
                                fontSize={9}
                                fontWeight={600}
                              >
                                {node.refCount}
                              </text>
                            </g>
                          )
                        })}
                      </svg>
                    </div>
                    <div className="backlink-graph__legend">
                      {TYPE_ORDER.map(type => {
                        const meta = TYPE_META[type]
                        return (
                          <span key={type} className="backlink-graph__legend-item">
                            <span
                              className="backlink-graph__legend-dot"
                              style={{ background: meta.color }}
                            />
                            {t(meta.label)}
                                                      </span>
                        )
                      })}
                      <span className="backlink-graph__legend-item">
                        <span className="backlink-graph__legend-line" />
                        {t('共现次数')}
                      </span>
                    </div>
                    <div className="backlink-graph__tip">{t('点击节点查看该实体详情')}</div>
                  </div>
                ) : compareMode ? (
                  /* ── Compare View ── */
                  <div className="backlink-compare">
                    <div className="backlink-compare__header">
                      <span className="backlink-compare__title">{t('选择 2-3 期对比')}</span>
                      <button className="backlink-compare__close" onClick={toggleCompareMode}>
                        <X size={14} />
                      </button>
                    </div>

                    {/* Selection bar */}
                    <div className="backlink-compare__bar">
                      <span className="backlink-compare__bar-label">
                        {t('已选')} <strong>{compareSelections.size}</strong> / 3
                      </span>
                      {compareSelections.size >= 2 && (
                        <span className="backlink-compare__hint">
                          {t('选择完成，点击下方卡片查看对比')}
                        </span>
                      )}
                    </div>

                    {/* Selectable timeline */}
                    <div className="backlink-compare__list">
                      {selectedEntry.podcastRefs.map(ref => {
                        const isSelected = compareSelections.has(ref.path)
                        return (
                          <div
                            key={ref.path}
                            className={`backlink-tl ${isSelected ? 'backlink-tl--selected' : ''}`}
                            onClick={() => toggleCompareSelection(ref.path)}
                          >
                            <div className="backlink-tl__checkbox">
                              {isSelected && <Check size={12} />}
                            </div>
                            <div className="backlink-tl__body">
                              <div className="backlink-tl__meta">
                                {ref.date && <span className="backlink-tl__date">{ref.date}</span>}
                                {ref.episode && (
                                  <>
                                    <span className="backlink-tl__sep">·</span>
                                    <span className="backlink-tl__ep">{ref.episode}</span>
                                  </>
                                )}
                                {ref.show && (
                                  <>
                                    <span className="backlink-tl__sep">·</span>
                                    <span className="backlink-tl__show">{ref.show}</span>
                                  </>
                                )}
                              </div>
                              <div className="backlink-tl__title">{ref.title}</div>
                              {ref.context ? (
                                <div className="backlink-tl__ctx">{ref.context}</div>
                              ) : (
                                <div className="backlink-tl__ctx backlink-tl__ctx--empty">
                                  {t('无法提取上下文')}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Diff view when 2+ selected */}
                    {compareRefs.length >= 2 && (
                      <div className="backlink-compare__diff">
                        <div className="backlink-detail__section-label">{t('观点对比')}</div>
                        <div
                          className="backlink-compare__columns"
                          style={{ gridTemplateColumns: `repeat(${compareRefs.length}, 1fr)` }}
                        >
                          {compareRefs.map((ref, i) => {
                            const isLast = i === compareRefs.length - 1
                            const prevRef = i > 0 ? compareRefs[i - 1] : null
                            const segments =
                              prevRef && prevRef.context && ref.context
                                ? computeSentenceDiff(prevRef.context, ref.context)
                                : null

                            return (
                              <div key={ref.path} className="backlink-compare__col">
                                <div className="backlink-compare__col-header">
                                  <span className="backlink-compare__col-date">{ref.date}</span>
                                  {ref.episode && (
                                    <span className="backlink-compare__col-ep">{ref.episode}</span>
                                  )}
                                </div>
                                <div className="backlink-compare__col-title">{ref.title}</div>
                                <div className="backlink-compare__col-meta-row">
                                  {ref.show && <span>{ref.show}</span>}
                                  {ref.category && (
                                    <span
                                      style={{
                                        color: CATEGORY_COLORS[ref.category] || 'var(--text-muted)',
                                      }}
                                    >
                                      {ref.category}
                                    </span>
                                  )}
                                </div>
                                <div className="backlink-compare__col-context">
                                  {segments ? (
                                    segments.map((seg, si) => (
                                      <span
                                        key={si}
                                        className={`backlink-diff__seg backlink-diff__seg--${seg.type}`}
                                      >
                                        {seg.text}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="backlink-compare__col-ctx">
                                      {ref.context || t('无上下文')}
                                    </span>
                                  )}
                                </div>
                                {isLast && (
                                  <button
                                    className="backlink-compare__open-btn"
                                    onClick={() => openNote(ref.path)}
                                  >
                                    {t('打开笔记')}
                                                                      </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {compareRefs.length >= 2 && compareRefs.some(r => r.context) && (
                          <div className="backlink-compare__legend-diff">
                            <span className="backlink-compare__legend-item">
                              <span className="backlink-diff__dot backlink-diff__dot--added" />
                              {t('新增观点')}
                            </span>
                            <span className="backlink-compare__legend-item">
                              <span className="backlink-diff__dot backlink-diff__dot--removed" />
                              {t('上期提及')}
                            </span>
                            <span className="backlink-compare__legend-item">
                              <span className="backlink-diff__dot backlink-diff__dot--common" />
                              {t('持续讨论')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Normal Detail View ── */
                  <>
                    {/* Entity header */}
                    <div className="backlink-detail__header">
                      {(() => {
                        const meta = TYPE_META[selectedEntry.entityType] || TYPE_META.concepts
                        const Icon = meta.icon
                        return <Icon size={16} style={{ color: meta.color }} />
                      })()}
                      <span className="backlink-detail__name">{selectedEntry.entityName}</span>
                      <span className="backlink-detail__badge">
                        {selectedEntry.podcastRefs.length}
                      </span>
                      {coEntities.length > 0 && (
                        <button
                          className="backlink-detail__graph-btn"
                          onClick={toggleGraphMode}
                          title={t('查看关系图谱')}
                        >
                          <Network size={12} />
                          {t('图谱')}
                        </button>
                      )}
                      {selectedEntry.podcastRefs.length >= 2 && (
                        <button
                          className="backlink-detail__compare-btn"
                          onClick={toggleCompareMode}
                          title={t('对比不同期的观点')}
                        >
                          {t('对比')}
                        </button>
                      )}
                    </div>

                    {/* Timeline */}
                    <div className="backlink-detail__section-label">{t('时间线')}</div>
                    {selectedEntry.podcastRefs.map(ref => (
                      <div
                        key={ref.path}
                        className="backlink-tl"
                        onClick={() => openNote(ref.path)}
                        onContextMenu={e => handleContextMenu(e, ref.path)}
                      >
                        <div className="backlink-tl__dot-line">
                          <span className="backlink-tl__dot" />
                        </div>
                        <div className="backlink-tl__body">
                          <div className="backlink-tl__meta">
                            {ref.date && <span className="backlink-tl__date">{ref.date}</span>}
                            {ref.episode && (
                              <>
                                <span className="backlink-tl__sep">·</span>
                                <span className="backlink-tl__ep">{ref.episode}</span>
                              </>
                            )}
                            {ref.show && (
                              <>
                                <span className="backlink-tl__sep">·</span>
                                <span className="backlink-tl__show">{ref.show}</span>
                              </>
                            )}
                            {ref.category && (
                              <span
                                className="backlink-tl__cat"
                                style={{
                                  color: CATEGORY_COLORS[ref.category] || 'var(--text-muted)',
                                }}
                              >
                                {ref.category}
                              </span>
                            )}
                          </div>
                          <div className="backlink-tl__title">{ref.title}</div>
                          {ref.context ? (
                            <div className="backlink-tl__ctx">{ref.context}</div>
                          ) : (
                            <div className="backlink-tl__ctx backlink-tl__ctx--empty">
                              {t('无法提取上下文')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Co-occurrence */}
                    {coEntities.length > 0 && (
                      <>
                        <div className="backlink-detail__section-label">{t('共现实体')}</div>
                        <div className="backlink-co">
                          {displayedCo.map(co => {
                            const coMeta = TYPE_META[co.type] || TYPE_META.concepts
                            const CoIcon = coMeta.icon
                            return (
                              <button
                                key={co.name}
                                className="backlink-co__item"
                                onClick={() => handleCoEntityClick(co.name, co.type)}
                              >
                                <CoIcon size={12} style={{ color: coMeta.color }} />
                                <span>{co.name}</span>
                                <span className="backlink-co__count">{co.count}</span>
                                <ChevronRight size={10} style={{ opacity: 0.3 }} />
                              </button>
                            )
                          })}
                          {!showAllCo && coEntities.length > 5 && (
                            <button
                              className="backlink-co__more"
                              onClick={() => setShowAllCo(true)}
                            >
                              {t('查看更多')}（{coEntities.length - 5}）
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )
              ) : (
                <div className="backlink-split__empty">
                  <Lightbulb size={24} style={{ opacity: 0.2 }} />
                  <span>{t('选择左侧实体查看详情')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="backlink-panel__legend">
            {TYPE_ORDER.map(type => {
              const meta = TYPE_META[type]
              const Icon = meta.icon
              return (
                <span key={type} className="backlink-panel__legend-item">
                  <Icon size={10} style={{ color: meta.color }} />
                  {t(meta.label)} {typeCounts[type]}
                </span>
              )
            })}
          </div>
        </>
      )}

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

        .backlink-panel__search {
          position: relative;
          padding: 12px 20px;
        }
        .backlink-panel__search-icon {
          position: absolute;
          left: 32px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s, opacity 0.2s;
        }
        .backlink-panel__search-input {
          width: 100%;
          height: 44px;
          padding: 0 14px 0 36px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 13px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .backlink-panel__search-input:focus,
        .backlink-panel__search-input:focus-visible {
          border-color: var(--accent);
          outline: none;
          box-shadow: none;
        }
        .backlink-panel__search:has(.backlink-panel__search-input:focus) .backlink-panel__search-icon {
          color: var(--accent);
          opacity: 0.7;
        }
        .backlink-panel__search-input::placeholder {
          color: var(--text-muted);
        }

        /* ── Tabs ── */
        .backlink-tabs {
          display: flex;
          padding: 0 16px;
          gap: 2px;
          border-bottom: 1px solid var(--border-soft);
        }
        .backlink-tab {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 8px 10px;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          color: var(--text-muted);
          font-size: var(--fs-sm);
          cursor: pointer;
          transition: all 0.1s;
          margin-bottom: -1px;
        }
        .backlink-tab:hover {
          color: var(--text-secondary);
        }
        .backlink-tab.is-active {
          color: var(--text-primary);
          border-bottom-color: var(--accent);
        }
        .backlink-tab__label { font-weight: 500; }
        .backlink-tab__count {
          font-size: 10px;
          background: var(--bg-elevated);
          padding: 1px 6px;
          border-radius: 8px;
          color: var(--text-muted);
        }
        .backlink-tab.is-active .backlink-tab__count {
          background: var(--accent);
          color: #fff;
        }

        /* ── Split layout ── */
        .backlink-split {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .backlink-split__left {
          width: 150px;
          border-right: 1px solid var(--border-soft);
          overflow-y: auto;
          padding: 6px;
          flex-shrink: 0;
        }
        .backlink-split__right {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          min-width: 0;
        }

        .backlink-split__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 30px 10px;
          text-align: center;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }

        /* ── Mini entity list ── */
        .backlink-mini {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 7px 8px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-primary);
          font-size: var(--fs-sm);
          cursor: pointer;
          text-align: left;
          transition: all 0.1s;
          border-left: 2px solid transparent;
        }
        .backlink-mini:hover { background: var(--bg-elevated); }
        .backlink-mini.is-active {
          background: var(--bg-elevated);
          border-left-color: var(--accent);
        }
        .backlink-mini__name {
          flex: 1;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .backlink-mini__badge {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: var(--bg-elevated);
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .backlink-mini.is-active .backlink-mini__badge {
          background: var(--accent);
          color: #fff;
        }

        /* ── Detail panel ── */
        .backlink-detail__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .backlink-detail__name {
          font-size: var(--fs-lg);
          font-weight: 700;
          color: var(--text-primary);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .backlink-detail__badge {
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
          flex-shrink: 0;
        }
        .backlink-detail__compare-btn {
          display: flex;
          align-items: center;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: var(--fs-xs);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .backlink-detail__compare-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }
        .backlink-detail__section-label {
          font-size: var(--fs-xs);
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 10px 0 4px;
        }

        /* ── Timeline card ── */
        .backlink-tl {
          display: flex;
          gap: 10px;
          padding: 10px;
          margin: 2px 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.1s;
        }
        .backlink-tl:hover { background: var(--bg-surface); }
        .backlink-tl--selected {
          background: rgba(124, 58, 237, 0.08);
          border: 1px solid rgba(124, 58, 237, 0.2);
        }
        .backlink-tl__dot-line {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 4px;
          flex-shrink: 0;
        }
        .backlink-tl__dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .backlink-tl__checkbox {
          width: 18px;
          height: 18px;
          border: 1.5px solid var(--border);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
          transition: all 0.1s;
          color: #fff;
        }
        .backlink-tl--selected .backlink-tl__checkbox {
          background: var(--accent);
          border-color: var(--accent);
        }
        .backlink-tl__body {
          flex: 1;
          min-width: 0;
        }
        .backlink-tl__meta {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          color: var(--text-muted);
          margin-bottom: 3px;
          flex-wrap: wrap;
        }
        .backlink-tl__date {
          font-weight: 600;
          color: var(--text-secondary);
        }
        .backlink-tl__sep { opacity: 0.5; }
        .backlink-tl__ep {
          color: var(--accent);
          font-weight: 500;
        }
        .backlink-tl__show { color: var(--text-muted); }
        .backlink-tl__cat {
          font-weight: 500;
          margin-left: auto;
        }
        .backlink-tl__title {
          font-size: var(--fs-sm);
          color: var(--text-primary);
          font-weight: 500;
          line-height: 1.4;
          margin-bottom: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .backlink-tl__ctx {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .backlink-tl__ctx--empty {
          opacity: 0.4;
          font-style: italic;
        }

        /* ── Compare view ── */
        .backlink-compare__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .backlink-compare__title {
          font-size: var(--fs-lg);
          font-weight: 700;
          color: var(--text-primary);
        }
        .backlink-compare__close {
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
        .backlink-compare__close:hover {
          color: var(--error);
          border-color: var(--error);
        }
        .backlink-compare__bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          margin-bottom: 8px;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .backlink-compare__bar-label strong {
          color: var(--accent);
          font-weight: 700;
        }
        .backlink-compare__hint {
          color: var(--success);
          font-size: var(--fs-xs);
        }
        .backlink-compare__list {
          max-height: 240px;
          overflow-y: auto;
          border: 1px solid var(--border-soft);
          border-radius: var(--radius-sm);
          padding: 4px;
        }
        .backlink-compare__diff {
          margin-top: 12px;
        }
        .backlink-compare__columns {
          display: grid;
          gap: 8px;
          margin-top: 6px;
        }
        .backlink-compare__col {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px;
          min-width: 0;
        }
        .backlink-compare__col-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
        .backlink-compare__col-date {
          font-weight: 600;
          color: var(--text-secondary);
        }
        .backlink-compare__col-ep {
          color: var(--accent);
          font-weight: 500;
        }
        .backlink-compare__col-title {
          font-size: var(--fs-sm);
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .backlink-compare__col-meta-row {
          display: flex;
          gap: 6px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .backlink-compare__col-context {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.6;
          border-top: 1px solid var(--border-soft);
          padding-top: 8px;
        }
        .backlink-compare__col-ctx {
          color: var(--text-muted);
        }
        .backlink-compare__open-btn {
          display: block;
          width: 100%;
          padding: 5px;
          margin-top: 8px;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: transparent;
          color: var(--accent);
          font-size: var(--fs-xs);
          cursor: pointer;
          text-align: center;
          transition: all 0.1s;
        }
        .backlink-compare__open-btn:hover {
          background: var(--bg-elevated);
        }

        /* ── Diff segments ── */
        .backlink-diff__seg {
          line-height: 1.6;
        }
        .backlink-diff__seg--common {
          color: var(--text-muted);
        }
        .backlink-diff__seg--added {
          background: rgba(16, 185, 129, 0.12);
          color: var(--success);
          border-radius: 2px;
          padding: 0 2px;
        }
        .backlink-diff__seg--removed {
          background: rgba(239, 68, 68, 0.08);
          color: var(--error);
          text-decoration: line-through;
          opacity: 0.6;
          border-radius: 2px;
          padding: 0 2px;
        }

        .backlink-compare__legend-diff {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid var(--border-soft);
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
        .backlink-compare__legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .backlink-diff__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .backlink-diff__dot--added { background: var(--success); }
        .backlink-diff__dot--removed { background: var(--error); }
        .backlink-diff__dot--common { background: var(--text-muted); }

        /* ── Co-occurrence ── */
        .backlink-co {
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 6px;
        }
        .backlink-co__item {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 5px 6px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-primary);
          font-size: var(--fs-sm);
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
        }
        .backlink-co__item:hover { background: var(--bg-elevated); }
        .backlink-co__count {
          margin-left: auto;
          color: var(--text-muted);
          font-size: var(--fs-xs);
        }
        .backlink-co__more {
          display: block;
          width: 100%;
          padding: 4px;
          margin-top: 2px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--accent);
          font-size: var(--fs-xs);
          cursor: pointer;
          text-align: center;
          transition: background 0.1s;
        }
        .backlink-co__more:hover { background: var(--bg-elevated); }

        /* ── Legend ── */
        .backlink-panel__legend {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 20px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
          border-top: 1px solid var(--border-soft);
        }
        .backlink-panel__legend-item {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        /* ── Graph button ── */
        .backlink-detail__graph-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: var(--fs-xs);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .backlink-detail__graph-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        /* ── Graph view ── */
        .backlink-graph {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .backlink-graph__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .backlink-graph__title {
          font-size: var(--fs-lg);
          font-weight: 700;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .backlink-graph__close {
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
          flex-shrink: 0;
        }
        .backlink-graph__close:hover {
          color: var(--error);
          border-color: var(--error);
        }
        .backlink-graph__canvas-wrap {
          flex: 1;
          min-height: 200px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .backlink-graph__svg {
          max-width: 100%;
          max-height: 100%;
        }
        .backlink-graph__edge {
          transition: opacity 0.15s, stroke 0.15s;
        }
        .backlink-graph__node {
          transition: opacity 0.15s;
        }
        .backlink-graph__node circle {
          transition: stroke-width 0.15s;
        }
        .backlink-graph__node:hover circle {
          stroke-width: 3;
        }
        .backlink-graph__legend {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 8px 0 4px;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
        .backlink-graph__legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .backlink-graph__legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .backlink-graph__legend-line {
          display: inline-block;
          width: 16px;
          height: 2px;
          background: var(--border);
          border-radius: 1px;
        }
        .backlink-graph__tip {
          font-size: var(--fs-xs);
          color: var(--text-muted);
          text-align: center;
          padding-top: 4px;
        }

        /* ── Top view toggle ── */
        .backlink-panel__topview {
          display: flex;
          gap: 2px;
          margin-left: auto;
          margin-right: 8px;
          background: var(--bg-elevated);
          border-radius: 6px;
          padding: 2px;
        }
        .backlink-topview__btn {
          padding: 4px 12px;
          font-size: var(--fs-sm);
          font-weight: 500;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .backlink-topview__btn:hover { color: var(--text-primary); }
        .backlink-topview__btn.is-active {
          background: var(--bg-card);
          color: var(--text-primary);
        }

        /* ── Category overview ── */
        .tag-category-overview {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          padding: 12px 20px 8px;
        }
        .tag-category-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 10px 8px;
          background: var(--bg-elevated);
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tag-category-card:hover { background: var(--bg-card); }
        .tag-category-card.is-active {
          background: var(--bg-card);
          border-width: 2px;
        }
        .tag-category-card__name {
          font-size: var(--fs-sm);
          font-weight: 600;
          color: var(--text-primary);
        }
        .tag-category-card__count {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-muted);
        }

        /* ── Tag cloud ── */
        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          padding: 8px 20px 12px;
          overflow-y: auto;
          flex: 0 0 auto;
          max-height: 180px;
        }
        .tag-cloud__empty {
          color: var(--text-muted);
          font-size: var(--fs-sm);
          padding: 16px 0;
        }
        .tag-cloud__item {
          display: inline-flex;
          align-items: baseline;
          gap: 3px;
          padding: 2px 8px;
          background: var(--bg-elevated);
          border: 1px solid transparent;
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }
        .tag-cloud__item:hover {
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .tag-cloud__item.is-active {
          background: var(--accent-bg, rgba(99, 102, 241, 0.15));
          color: var(--accent);
          border-color: var(--accent);
        }
        .tag-cloud__count {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 400;
        }

        /* ── Tag detail ── */
        .tag-detail {
          flex: 1;
          overflow-y: auto;
          padding: 0 20px 16px;
        }
        .tag-detail__header {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 8px;
        }
        .tag-detail__title {
          font-size: var(--fs-lg);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .tag-detail__count {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .tag-detail__list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tag-detail__item {
          background: var(--bg-elevated);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .tag-detail__item-main {
          cursor: pointer;
        }
        .tag-detail__item-title {
          font-size: var(--fs-sm);
          font-weight: 600;
          color: var(--text-primary);
          display: block;
        }
        .tag-detail__item-meta {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .tag-detail__item-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        .tag-detail__tag {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          background: var(--bg-card);
          color: var(--text-muted);
        }
        .tag-detail__tag.is-highlight {
          background: var(--accent-bg, rgba(99, 102, 241, 0.15));
          color: var(--accent);
          font-weight: 600;
        }
        .tag-detail__related {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px dashed var(--border);
        }
        .tag-detail__related-label {
          font-size: 10px;
          color: var(--text-muted);
          margin-bottom: 4px;
          display: block;
        }
        .tag-detail__related-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 3px 0;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 11px;
          color: var(--text-secondary);
        }
        .tag-detail__related-item:hover {
          color: var(--accent);
        }
        .tag-detail__related-shared {
          color: var(--text-muted);
          font-size: 10px;
        }
      `}</style>
    </div>
  )
}
