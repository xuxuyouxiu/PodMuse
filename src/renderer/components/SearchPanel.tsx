import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Tag as TagIcon,
  FolderOpen,
  Radio,
  Users,
  ArrowUpDown,
  FileText,
} from 'lucide-react'

// ── Constants ──

const CATEGORY_COLORS: Record<string, string> = {
  科技商业: '#3b82f6',
  每日资讯: '#10b981',
  社会心理: '#f59e0b',
  生活文化: '#ec4899',
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  people: '人物',
  projects: '项目',
  concepts: '概念',
  terms: '术语',
}

const PAGE_SIZE = 20

// ── Component ──

export default function SearchPanel() {
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'date_desc' | 'date_asc'>('score')
  const [page, setPage] = useState(0)

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedShow, setSelectedShow] = useState<string | undefined>(undefined)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])

  // Data
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [globalFacets, setGlobalFacets] = useState<SearchFacets | null>(null)
  const [error, setError] = useState<string | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper: load global facets from backend
  const refreshFacets = useCallback(async () => {
    try {
      const f = await window.electronAPI.searchFacets()
      setGlobalFacets(f)
    } catch (e) {
      console.error('Failed to load facets:', e)
    }
  }, [])

  // Load global facets on mount (defer to microtask to avoid synchronous setState in effect)
  useEffect(() => {
    Promise.resolve().then(() => refreshFacets())
  }, [refreshFacets])

  // Build search params
  const params: SearchParams = useMemo(
    () => ({
      keyword: debouncedKeyword || undefined,
      filters: {
        category: selectedCategory,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        show: selectedShow,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        entityRefs: selectedEntities.length > 0 ? selectedEntities : undefined,
      },
      sortBy,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [
      debouncedKeyword,
      selectedCategory,
      selectedTags,
      selectedShow,
      dateFrom,
      dateTo,
      selectedEntities,
      sortBy,
      page,
    ],
  )

  // Trigger search on param change
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    // Use microtask to defer setLoading (avoid synchronous setState in effect body)
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })

    window.electronAPI
      .searchEnhanced(params)
      .then(r => {
        if (cancelled) return
        setResponse(r)
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        console.error('Search failed:', e)
        setError('搜索失败，请重试')
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [params])

  // Debounce keyword
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedKeyword(keyword)
      setPage(0)
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [keyword])

  // Use facets from response (filtered) if available, else global
  const facets = response?.facets || globalFacets

  // Handlers
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]))
    setPage(0)
  }

  const toggleEntity = (name: string) => {
    setSelectedEntities(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name)
      if (prev.length >= 3) return prev
      return [...prev, name]
    })
    setPage(0)
  }

  const clearAllFilters = () => {
    setSelectedCategory(undefined)
    setSelectedTags([])
    setSelectedShow(undefined)
    setDateFrom('')
    setDateTo('')
    setSelectedEntities([])
    setPage(0)
  }

  const handleCategoryClick = (cat: string | undefined) => {
    setSelectedCategory(cat)
    setPage(0)
  }

  const handleShowClick = (show: string | undefined) => {
    setSelectedShow(show)
    setPage(0)
  }

  const handleDateFromChange = (val: string) => {
    setDateFrom(val)
    setPage(0)
  }

  const handleDateToChange = (val: string) => {
    setDateTo(val)
    setPage(0)
  }

  const handleSortChange = (val: 'score' | 'date_desc' | 'date_asc') => {
    setSortBy(val)
    setPage(0)
  }

  const handleOpenNote = (path: string) => {
    window.electronAPI.openPath(path)
  }

  const total = response?.total || 0
  const results = response?.results || []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters = !!(
    selectedCategory ||
    selectedTags.length > 0 ||
    selectedShow ||
    dateFrom ||
    dateTo ||
    selectedEntities.length > 0
  )

  if (!globalFacets && loading) {
    return (
      <div className="search-panel">
        <div className="search-panel__loading">
          <RefreshCw size={16} className="search-panel__spin" />
          <span>正在加载索引...</span>
        </div>
        <style>{`
          .search-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
          .search-panel__loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--text-muted); font-size: var(--fs-base); }
          .search-panel__spin { animation: sp-spin 1s linear infinite; }
          @keyframes sp-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="search-panel">
      {/* Header: search bar + sort + refresh */}
      <div className="search-panel__header">
        <div className="search-panel__search-bar">
          <Search size={14} className="search-panel__search-icon" />
          <input
            type="text"
            className="search-panel__search-input"
            placeholder="搜索笔记标题、内容、标签..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            autoFocus
          />
          {keyword && (
            <button className="search-panel__clear-btn" onClick={() => setKeyword('')} title="清空">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="search-panel__sort">
          <ArrowUpDown size={13} />
          <select
            value={sortBy}
            onChange={e => handleSortChange(e.target.value as 'score' | 'date_desc' | 'date_asc')}
            className="search-panel__sort-select"
          >
            <option value="score">相关度</option>
            <option value="date_desc">最新</option>
            <option value="date_asc">最早</option>
          </select>
        </div>
        <button className="search-panel__refresh" onClick={refreshFacets} title="刷新索引">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Body: facet sidebar + result list */}
      <div className="search-panel__body">
        {/* Facet sidebar */}
        <aside className="search-panel__facets">
          {hasActiveFilters && (
            <button className="search-panel__clear-all" onClick={clearAllFilters}>
              <X size={12} /> 清除全部筛选
            </button>
          )}

          {/* Category filter (single select) */}
          <FacetSection title="分类" icon={<FolderOpen size={12} />}>
            <button
              className={`search-panel__facet-item ${!selectedCategory ? 'is-active' : ''}`}
              onClick={() => handleCategoryClick(undefined)}
            >
              <span>全部</span>
            </button>
            {facets?.categories.map(c => (
              <button
                key={c.value}
                className={`search-panel__facet-item ${selectedCategory === c.value ? 'is-active' : ''}`}
                onClick={() =>
                  handleCategoryClick(selectedCategory === c.value ? undefined : c.value)
                }
              >
                <span
                  className="search-panel__facet-dot"
                  style={{ background: CATEGORY_COLORS[c.value] || '#888' }}
                />
                <span>{c.value}</span>
                <span className="search-panel__facet-count">{c.count}</span>
              </button>
            ))}
          </FacetSection>

          {/* Tags filter (multi select, OR) */}
          <FacetSection title="标签" icon={<TagIcon size={12} />}>
            {facets?.tags.length === 0 && <div className="search-panel__facet-empty">无标签</div>}
            {facets?.tags.slice(0, 30).map(t => (
              <label
                key={t.value}
                className={`search-panel__facet-check ${selectedTags.includes(t.value) ? 'is-active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(t.value)}
                  onChange={() => toggleTag(t.value)}
                />
                <span>{t.value}</span>
                <span className="search-panel__facet-count">{t.count}</span>
              </label>
            ))}
          </FacetSection>

          {/* Show filter (single select) */}
          <FacetSection title="节目" icon={<Radio size={12} />}>
            <button
              className={`search-panel__facet-item ${!selectedShow ? 'is-active' : ''}`}
              onClick={() => handleShowClick(undefined)}
            >
              <span>全部</span>
            </button>
            {facets?.shows.map(s => (
              <button
                key={s.value}
                className={`search-panel__facet-item ${selectedShow === s.value ? 'is-active' : ''}`}
                onClick={() => handleShowClick(selectedShow === s.value ? undefined : s.value)}
              >
                <span>{s.value}</span>
                <span className="search-panel__facet-count">{s.count}</span>
              </button>
            ))}
          </FacetSection>

          {/* Date range filter */}
          <FacetSection title="日期范围" icon={<Calendar size={12} />}>
            <div className="search-panel__date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={e => handleDateFromChange(e.target.value)}
                className="search-panel__date-input"
                placeholder="从"
              />
              <span className="search-panel__date-sep">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => handleDateToChange(e.target.value)}
                className="search-panel__date-input"
                placeholder="到"
              />
              {facets?.dateRange.earliest && (
                <div className="search-panel__date-hint">
                  范围：{facets.dateRange.earliest} ~ {facets.dateRange.latest || ''}
                </div>
              )}
            </div>
          </FacetSection>

          {/* Entity filter (multi select, max 3, OR) */}
          <FacetSection
            title={`实体 ${selectedEntities.length > 0 ? `(${selectedEntities.length}/3)` : ''}`}
            icon={<Users size={12} />}
          >
            {facets?.topEntities.length === 0 && (
              <div className="search-panel__facet-empty">无实体</div>
            )}
            {facets?.topEntities.map(e => (
              <label
                key={e.value}
                className={`search-panel__facet-check ${selectedEntities.includes(e.value) ? 'is-active' : ''} ${selectedEntities.length >= 3 && !selectedEntities.includes(e.value) ? 'is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedEntities.includes(e.value)}
                  onChange={() => toggleEntity(e.value)}
                  disabled={selectedEntities.length >= 3 && !selectedEntities.includes(e.value)}
                />
                <span className="search-panel__entity-type">
                  {ENTITY_TYPE_LABEL[e.type] || e.type}
                </span>
                <span>{e.value}</span>
                <span className="search-panel__facet-count">{e.count}</span>
              </label>
            ))}
          </FacetSection>
        </aside>

        {/* Result list */}
        <main className="search-panel__results">
          {error && <div className="search-panel__error">{error}</div>}

          {!error && !loading && results.length === 0 && (
            <div className="search-panel__empty">
              {debouncedKeyword || hasActiveFilters ? (
                <>
                  <FileText size={32} />
                  <div>未找到相关笔记</div>
                  <div className="search-panel__empty-hint">试试调整筛选条件或更换关键词</div>
                </>
              ) : (
                <>
                  <Search size={32} />
                  <div>输入关键词或选择筛选条件开始搜索</div>
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="search-panel__loading-list">
              <RefreshCw size={14} className="search-panel__spin" />
              <span>正在搜索...</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="search-panel__result-meta">
                共 <strong>{total}</strong> 条结果{' '}
                {debouncedKeyword && `(关键词: "${debouncedKeyword}")`}
              </div>
              <div className="search-panel__result-list">
                {results.map(r => (
                  <ResultCard key={r.path} result={r} onOpen={handleOpenNote} />
                ))}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="search-panel__pagination">
                  <button
                    className="search-panel__page-btn"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    <ChevronLeft size={14} /> 上一页
                  </button>
                  <span className="search-panel__page-info">
                    第 {page + 1} / {totalPages} 页 · 显示 {results.length} 条 / 共 {total} 条
                  </span>
                  <button
                    className="search-panel__page-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    下一页 <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <style>{`
        .search-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-base); }
        .search-panel__header { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); }
        .search-panel__search-bar { flex: 1; display: flex; align-items: center; gap: 8px; height: 44px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0 14px; transition: border-color 0.2s, box-shadow 0.2s; }
        .search-panel__search-bar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
        .search-panel__search-icon { color: var(--text-muted); flex-shrink: 0; transition: color 0.2s; } .search-panel__search-bar:focus-within .search-panel__search-icon { color: var(--accent); opacity: 0.7; }
        .search-panel__search-input { flex: 1; background: transparent; border: none; outline: none; font-size: var(--fs-base); color: var(--text-primary); }
        .search-panel__clear-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; border-radius: 3px; display: flex; }
        .search-panel__clear-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
        .search-panel__sort { display: flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: var(--fs-sm); }
        .search-panel__sort-select { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--fs-sm); color: var(--text-primary); outline: none; cursor: pointer; }
        .search-panel__refresh { background: transparent; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 6px; color: var(--text-muted); cursor: pointer; display: flex; }
        .search-panel__refresh:hover { color: var(--text-primary); background: var(--bg-hover); }

        .search-panel__body { flex: 1; display: flex; min-height: 0; }
        .search-panel__facets { width: 240px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); overflow-y: auto; padding: 16px; }
        .search-panel__clear-all { width: 100%; display: flex; align-items: center; gap: 4px; background: transparent; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); padding: 6px 10px; margin-bottom: 12px; color: var(--text-muted); cursor: pointer; font-size: var(--fs-sm); }
        .search-panel__clear-all:hover { color: var(--accent); border-color: var(--accent); }

        .search-panel__facet-section { margin-bottom: 20px; }
        .search-panel__facet-title { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; color: var(--text-secondary); margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em; }
        .search-panel__facet-item { width: 100%; display: flex; align-items: center; gap: 6px; background: transparent; border: none; padding: 4px 8px; cursor: pointer; color: var(--text-secondary); font-size: var(--fs-sm); border-radius: var(--radius-sm); text-align: left; }
        .search-panel__facet-item:hover { background: var(--bg-hover); }
        .search-panel__facet-item.is-active { background: var(--accent-light); color: var(--accent); font-weight: 600; }
        .search-panel__facet-item span:nth-child(2) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .search-panel__facet-check { width: 100%; display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer; color: var(--text-secondary); font-size: var(--fs-sm); border-radius: var(--radius-sm); }
        .search-panel__facet-check:hover { background: var(--bg-hover); }
        .search-panel__facet-check.is-active { background: var(--accent-light); color: var(--accent); }
        .search-panel__facet-check.is-disabled { opacity: 0.4; cursor: not-allowed; }
        .search-panel__facet-check input { margin: 0; }
        .search-panel__facet-check span:nth-child(2), .search-panel__facet-check span:nth-child(3) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .search-panel__facet-check span:nth-child(3) { flex: 1; }
        .search-panel__facet-count { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
        .search-panel__facet-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .search-panel__facet-empty { color: var(--text-muted); font-size: var(--fs-sm); padding: 4px 8px; }
        .search-panel__entity-type { font-size: 10px; padding: 1px 4px; background: var(--bg-elevated); border-radius: 3px; color: var(--text-muted); flex-shrink: 0; }

        .search-panel__date-range { display: flex; flex-direction: column; gap: 6px; }
        .search-panel__date-input { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 4px 6px; font-size: var(--fs-sm); color: var(--text-primary); outline: none; }
        .search-panel__date-sep { text-align: center; color: var(--text-muted); }
        .search-panel__date-hint { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

        .search-panel__results { flex: 1; min-width: 0; overflow-y: auto; padding: 16px 20px; }
        .search-panel__result-meta { color: var(--text-muted); font-size: var(--fs-sm); margin-bottom: 12px; }
        .search-panel__result-meta strong { color: var(--text-primary); }
        .search-panel__result-list { display: flex; flex-direction: column; gap: 8px; }
        .search-panel__result-card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px; cursor: pointer; transition: border-color 0.15s, transform 0.1s; }
        .search-panel__result-card:hover { border-color: var(--accent); transform: translateY(-1px); }
        .search-panel__result-title { font-size: var(--fs-base); font-weight: 600; color: var(--text-primary); margin: 0 0 4px 0; line-height: 1.4; }
        .search-panel__result-title mark { background: rgba(250, 204, 21, 0.4); color: inherit; padding: 0 2px; border-radius: 2px; }
        .search-panel__result-meta-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; font-size: 11px; color: var(--text-muted); }
        .search-panel__result-badge { padding: 1px 6px; border-radius: 10px; font-size: 10px; color: white; }
        .search-panel__result-show { color: var(--text-secondary); }
        .search-panel__result-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
        .search-panel__result-tag { font-size: 10px; padding: 1px 6px; background: var(--bg-hover); border-radius: 10px; color: var(--text-secondary); }
        .search-panel__result-tag.is-highlight { background: rgba(250, 204, 21, 0.3); color: var(--text-primary); font-weight: 500; }
        .search-panel__result-excerpt { font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.5; max-height: 60px; overflow: hidden; }
        .search-panel__result-excerpt mark { background: rgba(250, 204, 21, 0.4); color: inherit; padding: 0 2px; border-radius: 2px; }
        .search-panel__result-match-types { display: flex; gap: 4px; margin-top: 4px; }
        .search-panel__match-type { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: var(--bg-hover); color: var(--text-muted); }

        .search-panel__empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); font-size: var(--fs-base); text-align: center; }
        .search-panel__empty-hint { font-size: var(--fs-sm); opacity: 0.8; }
        .search-panel__loading, .search-panel__loading-list { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--text-muted); font-size: var(--fs-base); }
        .search-panel__spin { animation: sp-spin 1s linear infinite; }
        @keyframes sp-spin { to { transform: rotate(360deg); } }
        .search-panel__error { padding: 20px; color: var(--danger); text-align: center; }

        .search-panel__pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0; border-top: 1px solid var(--border-subtle); margin-top: 12px; }
        .search-panel__page-btn { display: flex; align-items: center; gap: 4px; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 6px 12px; color: var(--text-primary); cursor: pointer; font-size: var(--fs-sm); }
        .search-panel__page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .search-panel__page-info { color: var(--text-muted); font-size: var(--fs-sm); }
      `}</style>
    </div>
  )
}

// ── Facet section wrapper ──

function FacetSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="search-panel__facet-section">
      <h4 className="search-panel__facet-title">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  )
}

// ── Result card ──

function ResultCard({ result, onOpen }: { result: SearchResult; onOpen: (path: string) => void }) {
  return (
    <div className="search-panel__result-card" onClick={() => onOpen(result.path)}>
      <h3
        className="search-panel__result-title"
        dangerouslySetInnerHTML={{ __html: result.title }}
      />
      <div className="search-panel__result-meta-row">
        {result.date && <span>{result.date}</span>}
        {result.category && (
          <span
            className="search-panel__result-badge"
            style={{ background: CATEGORY_COLORS[result.category] || '#888' }}
          >
            {result.category}
          </span>
        )}
        {result.show && <span className="search-panel__result-show">· {result.show}</span>}
        {result.matchType.length > 0 && (
          <div className="search-panel__result-match-types">
            {result.matchType.map(t => (
              <span key={t} className="search-panel__match-type">
                {t === 'title' ? '标题' : t === 'tags' ? '标签' : '正文'}
              </span>
            ))}
          </div>
        )}
      </div>
      {result.tags.length > 0 && (
        <div className="search-panel__result-tags">
          {result.tags.map(t => (
            <span key={t} className="search-panel__result-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {result.excerpt && (
        <div
          className="search-panel__result-excerpt"
          dangerouslySetInnerHTML={{ __html: result.excerpt }}
        />
      )}
    </div>
  )
}
