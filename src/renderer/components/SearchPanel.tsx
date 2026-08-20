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

import { useI18n } from '../i18n'
import '../styles/search-panel.css'
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from '../lib/category-colors'

// ── Constants ──

const ENTITY_TYPE_LABEL: Record<string, string> = {
  people: '人物',
  projects: '项目',
  concepts: '概念',
  terms: '术语',
}

const PAGE_SIZE = 20

// ── Component ──

export default function SearchPanel() {
  const { t } = useI18n()
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
          <span>{t('正在加载索引...')}</span>
        </div>
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
            placeholder={t('搜索笔记标题、内容、标签...')}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            autoFocus
          />
          {keyword && (
            <button className="search-panel__clear-btn" onClick={() => setKeyword('')} title={t('清空')}>
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
            <option value="score">{t('相关度')}</option>
            <option value="date_desc">{t('最新')}</option>
            <option value="date_asc">{t('最早')}</option>
          </select>
        </div>
        <button className="search-panel__refresh" onClick={refreshFacets} title={t('刷新索引')}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Body: facet sidebar + result list */}
      <div className="search-panel__body">
        {/* Facet sidebar */}
        <aside className="search-panel__facets">
          {hasActiveFilters && (
            <button className="search-panel__clear-all" onClick={clearAllFilters}>
              <X size={12} /> {t('清除全部筛选')}
            </button>
          )}

          {/* Category filter (single select) */}
          <FacetSection title={t('分类')} icon={<FolderOpen size={12} />}>
            <button
              className={`search-panel__facet-item ${!selectedCategory ? 'is-active' : ''}`}
              onClick={() => handleCategoryClick(undefined)}
            >
              <span>{t('全部')}</span>
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
                  style={{ background: CATEGORY_COLORS[c.value] || CATEGORY_COLOR_FALLBACK }}
                />
                <span>{c.value}</span>
                <span className="search-panel__facet-count">{c.count}</span>
              </button>
            ))}
          </FacetSection>

          {/* Tags filter (multi select, OR) */}
          <FacetSection title={t('标签')} icon={<TagIcon size={12} />}>
            {facets?.tags.length === 0 && <div className="search-panel__facet-empty">{t('无标签')}</div>}
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
          <FacetSection title={t('节目')} icon={<Radio size={12} />}>
            <button
              className={`search-panel__facet-item ${!selectedShow ? 'is-active' : ''}`}
              onClick={() => handleShowClick(undefined)}
            >
              <span>{t('全部')}</span>
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
          <FacetSection title={t('日期范围')} icon={<Calendar size={12} />}>
            <div className="search-panel__date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={e => handleDateFromChange(e.target.value)}
                className="search-panel__date-input"
                placeholder={t('从')}
              />
              <span className="search-panel__date-sep">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => handleDateToChange(e.target.value)}
                className="search-panel__date-input"
                placeholder={t('到')}
              />
              {facets?.dateRange.earliest && (
                <div className="search-panel__date-hint">
                  {t('范围')}：{facets.dateRange.earliest} ~ {facets.dateRange.latest || ''}
                </div>
              )}
            </div>
          </FacetSection>

          {/* Entity filter (multi select, max 3, OR) */}
          <FacetSection
            title={`${t('实体')} ${selectedEntities.length > 0 ? `(${selectedEntities.length}/3)` : ''}`}
            icon={<Users size={12} />}
          >
            {facets?.topEntities.length === 0 && (
              <div className="search-panel__facet-empty">{t('无实体')}</div>
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
                  {t(ENTITY_TYPE_LABEL[e.type] || e.type)}
                </span>
                <span>{e.value}</span>
                <span className="search-panel__facet-count">{e.count}</span>
              </label>
            ))}
          </FacetSection>
        </aside>

        {/* Result list */}
        <main className="search-panel__results">
          {error && <div className="search-panel__error">{t(error)}</div>}

          {!error && !loading && results.length === 0 && (
            <div className="search-panel__empty">
              {debouncedKeyword || hasActiveFilters ? (
                <>
                  <FileText size={32} />
                  <div>{t('未找到相关笔记')}</div>
                  <div className="search-panel__empty-hint">{t('试试调整筛选条件或更换关键词')}</div>
                </>
              ) : (
                <>
                  <Search size={32} />
                  <div>{t('输入关键词或选择筛选条件开始搜索')}</div>
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="search-panel__loading-list">
              <RefreshCw size={14} className="search-panel__spin" />
              <span>{t('正在搜索...')}</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="search-panel__result-meta">
                {t('共')} <strong>{total}</strong> {t('条结果')}{' '}
                {debouncedKeyword && `(${t('关键词')}: "${debouncedKeyword}")`}
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
                    <ChevronLeft size={14} /> {t('上一页')}
                  </button>
                  <span className="search-panel__page-info">
                    {t('第')} {page + 1} / {totalPages} {t('页')} · {t('显示')} {results.length} {t('条')} / {t('共')} {total} {t('条')}
                  </span>
                  <button
                    className="search-panel__page-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    {t('下一页')} <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

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
  const { t } = useI18n()
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
            style={{ background: CATEGORY_COLORS[result.category] || CATEGORY_COLOR_FALLBACK }}
          >
            {result.category}
          </span>
        )}
        {result.show && <span className="search-panel__result-show">· {result.show}</span>}
        {result.matchType.length > 0 && (
          <div className="search-panel__result-match-types">
            {result.matchType.map(mt => (
                          <span key={mt} className="search-panel__match-type">
                            {mt === 'title' ? t('标题') : mt === 'tags' ? t('标签') : t('正文')}
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
