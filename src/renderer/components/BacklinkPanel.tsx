import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Users,
  FolderOpen,
  Lightbulb,
  Bookmark,
  RefreshCw,
  Search,
  ChevronRight,
  X,
  Network,
} from 'lucide-react'

import { useI18n } from '../i18n'
import '../styles/backlink-panel.css'
import { CATEGORY_COLORS } from '../lib/category-colors'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

// ── Entity type metadata ──
// 颜色统一走 --entity-* token（与 NoteMarkdown 链接着色、QAPanel 引用色一致）
const TYPE_META: Record<string, { icon: typeof Users; label: string; color: string }> = {
  people: { icon: Users, label: '人物', color: 'var(--entity-people)' },
  projects: { icon: FolderOpen, label: '项目', color: 'var(--entity-projects)' },
  concepts: { icon: Lightbulb, label: '概念', color: 'var(--entity-concepts)' },
  terms: { icon: Bookmark, label: '术语', color: 'var(--entity-terms)' },
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

interface GraphNode extends SimulationNodeDatum {
  name: string
  type: string
  refCount: number
  radius: number
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
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
  const topCo = coEntities.slice(0, 20)

  const centerX = width / 2
  const centerY = height / 2

  const centerRef = target.podcastRefs.length
  const centerRadius = Math.max(16, Math.min(28, 10 + centerRef * 2))

  const nodes: GraphNode[] = [
    {
      name: selectedEntity,
      type: target.entityType,
      refCount: centerRef,
      radius: centerRadius,
      x: centerX,
      y: centerY,
      fx: centerX,
      fy: centerY,
    },
  ]

  const angleStep = topCo.length > 0 ? (2 * Math.PI) / topCo.length : 0
  topCo.forEach((co, i) => {
    const angle = angleStep * i - Math.PI / 2
    const entry = index.find(e => e.entityName === co.name)
    const refCount = entry ? entry.podcastRefs.length : 1
    const radius = Math.max(10, Math.min(20, 7 + refCount * 2))

    nodes.push({
      name: co.name,
      type: co.type,
      refCount,
      radius,
      x: centerX + 100 * Math.cos(angle),
      y: centerY + 100 * Math.sin(angle),
    })
  })

  const edges: GraphEdge[] = topCo.map(co => ({
    source: selectedEntity,
    target: co.name,
    count: co.count,
  }))

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
      if (overlap >= 2) {
        edges.push({ source: a.name, target: b.name, count: overlap })
      }
    }
  }

  return { nodes, edges }
}

// ── Sentence-level diff ──




// ── Component ──

export default function BacklinkPanel() {
  const { t } = useI18n()
  const [index, setIndex] = useState<BacklinkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<string>('people')
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [showAllCo, setShowAllCo] = useState(false)
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

  // Graph data with force simulation
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] })
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragNodeRef = useRef<GraphNode | null>(null)
  const W = 500, H = 400

  useEffect(() => {
    if (!selectedEntity || !graphMode) {
      if (simulationRef.current) {
        simulationRef.current.stop()
        simulationRef.current = null
      }
      return
    }

    const data = computeGraph(index, selectedEntity, W, H)
    if (data.nodes.length === 0) return

    if (simulationRef.current) simulationRef.current.stop()

    const sim = forceSimulation(data.nodes)
      .force('link', forceLink<GraphNode, SimulationLinkDatum<GraphNode>>(data.edges as unknown as SimulationLinkDatum<GraphNode>[])
        .id(d => d.name)
        .distance(90)
        .strength(0.4))
      .force('charge', forceManyBody<GraphNode>().strength(-350).distanceMax(250))
      .force('center', forceCenter(W / 2, H / 2).strength(0.05))
      .force('collide', forceCollide<GraphNode>().radius(d => d.radius + 12).strength(0.9))
      .alphaDecay(0.025)
      .velocityDecay(0.35)

    sim.on('tick', () => {
      setGraphData({ nodes: [...data.nodes], edges: [...data.edges] })
    })

    simulationRef.current = sim
    return () => { sim.stop() }
  }, [index, selectedEntity, graphMode])

  function handleDragStart(e: React.MouseEvent, node: GraphNode) {
    e.preventDefault()
    dragNodeRef.current = node
    node.fx = node.x
    node.fy = node.y
    simulationRef.current?.alphaTarget(0.3).restart()
  }

  function handleDragMove(e: React.MouseEvent) {
    if (!dragNodeRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    dragNodeRef.current.fx = ((e.clientX - rect.left) / rect.width) * W
    dragNodeRef.current.fy = ((e.clientY - rect.top) / rect.height) * H
  }

  function handleDragEnd() {
    if (!dragNodeRef.current) return
    dragNodeRef.current.fx = null
    dragNodeRef.current.fy = null
    dragNodeRef.current = null
    simulationRef.current?.alphaTarget(0)
  }

  // Helper: get node position from edge endpoint (d3 mutates source/target to objects)
  function getNodePos(edge: GraphEdge, side: 'source' | 'target'): { x: number; y: number } | null {
    const ref = edge[side]
    if (typeof ref === 'object' && ref !== null && 'x' in ref) {
      return { x: (ref as GraphNode).x ?? 0, y: (ref as GraphNode).y ?? 0 }
    }
    const node = graphData.nodes.find(n => n.name === ref)
    return node ? { x: node.x ?? 0, y: node.y ?? 0 } : null
  }

  function getEdgeEndpoints(edge: GraphEdge) {
    return { src: getNodePos(edge, 'source'), tgt: getNodePos(edge, 'target') }
  }

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
    setGraphMode(false)
    setHoveredNode(null)
    const first = index.find(e => e.entityType === type)
    if (first) setSelectedEntity(first.entityName)
    else setSelectedEntity(null)
  }

  function handleEntityClick(name: string) {
    setSelectedEntity(name)
    setShowAllCo(false)
    setGraphMode(false)
    setHoveredNode(null)
  }

  function handleCoEntityClick(name: string, type: string) {
    if (type !== activeTab) setActiveTab(type)
    setSelectedEntity(name)
    setShowAllCo(false)
    setGraphMode(false)
    setHoveredNode(null)
  }



  function toggleGraphMode() {
    if (graphMode) setGraphData({ nodes: [], edges: [] })
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
                        ref={svgRef}
                        className="backlink-graph__svg"
                        viewBox={`0 0 ${W} ${H}`}
                        width="100%"
                        height="100%"
                        onMouseMove={handleDragMove}
                        onMouseUp={handleDragEnd}
                        onMouseLeave={handleDragEnd}
                      >
                        <defs>
                          {/* Glow filter for center node */}
                          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          {/* Soft glow for connected nodes */}
                          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          {/* Gradient for edges */}
                          <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
                            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.6" />
                          </linearGradient>
                        </defs>

                        {/* Edges */}
                        {graphData.edges.map((edge, i) => {
                          const { src, tgt } = getEdgeEndpoints(edge)
                          if (!src || !tgt) return null
                          const edgeSrc = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).name
                          const edgeTgt = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).name
                          const isHighlighted = hoveredNode === edgeSrc || hoveredNode === edgeTgt
                          const thickness = Math.max(1.5, Math.min(4, edge.count * 0.8))
                          return (
                            <line
                              key={`edge-${i}`}
                              x1={src.x}
                              y1={src.y}
                              x2={tgt.x}
                              y2={tgt.y}
                              stroke={isHighlighted ? 'url(#edge-gradient)' : 'var(--border)'}
                              strokeWidth={isHighlighted ? thickness + 1 : thickness}
                              opacity={isHighlighted ? 0.9 : 0.25}
                              strokeLinecap="round"
                            />
                          )
                        })}

                        {/* Nodes */}
                        {graphData.nodes.map(node => {
                          const meta = TYPE_META[node.type] || TYPE_META.concepts
                          const isCenter = node.name === selectedEntity
                          const isHovered = hoveredNode === node.name
                          const isConnected = hoveredNode && graphData.edges.some(e => {
                            const s = typeof e.source === 'object' ? (e.source as GraphNode).name : e.source
                            const t = typeof e.target === 'object' ? (e.target as GraphNode).name : e.target
                            return (s === hoveredNode && t === node.name) || (t === hoveredNode && s === node.name)
                          })
                          const dimmed = hoveredNode && !isHovered && !isConnected && !isCenter
                          return (
                            <g
                              key={`node-${node.name}`}
                              style={{ cursor: 'grab', opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.18s' }}
                              onMouseEnter={() => setHoveredNode(node.name)}
                              onMouseLeave={() => setHoveredNode(null)}
                              onMouseDown={e => handleDragStart(e, node)}
                              onClick={() => { if (!dragNodeRef.current) handleGraphNodeClick(node.name) }}
                            >
                              {/* Outer glow ring for center */}
                              {isCenter && (
                                <circle
                                  cx={node.x!}
                                  cy={node.y!}
                                  r={node.radius + 6}
                                  fill="none"
                                  stroke={meta.color}
                                  strokeWidth={2}
                                  opacity={0.3}
                                  filter="url(#glow)"
                                />
                              )}
                              {/* Main circle */}
                              <circle
                                cx={node.x!}
                                cy={node.y!}
                                r={node.radius}
                                fill={isCenter ? meta.color : 'var(--bg-card)'}
                                stroke={meta.color}
                                strokeWidth={isCenter ? 2.5 : 1.5}
                                filter={isCenter ? 'url(#glow)' : isHovered ? 'url(#soft-glow)' : undefined}
                              />
                              {/* Inner highlight */}
                              <circle
                                cx={node.x!}
                                cy={node.y! - node.radius * 0.2}
                                r={node.radius * 0.5}
                                fill="white"
                                opacity={0.1}
                              />
                              {/* Count text */}
                              <text
                                x={node.x!}
                                y={node.y! + 4}
                                textAnchor="middle"
                                fill={isCenter ? '#fff' : 'var(--text-primary)'}
                                fontSize={isCenter ? 12 : 10}
                                fontWeight={700}
                              >
                                {node.refCount}
                              </text>
                              {/* Name label */}
                              <text
                                x={node.x!}
                                y={node.y! + node.radius + 16}
                                textAnchor="middle"
                                fill="var(--text-primary)"
                                fontSize={isCenter ? 11 : 9.5}
                                fontWeight={isCenter ? 600 : 400}
                              >
                                {node.name.length > 8 ? node.name.slice(0, 8) + '…' : node.name}
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
                            <span className="backlink-graph__legend-dot" style={{ background: meta.color }} />
                            {t(meta.label)}
                          </span>
                        )
                      })}
                    </div>
                    <div className="backlink-graph__tip">{t('拖拽节点调整布局 · 点击查看详情')}</div>
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

    </div>
  )
}
