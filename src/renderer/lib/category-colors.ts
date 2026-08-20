/**
 * 类目色统一映射（搜索 facet、订阅分类、标签染色通用）
 *
 * 颜色值定义在 globals.css 的 --cat-* token 中（含深色主题覆盖），
 * 此处只保留「类目名 → token」的单一映射，避免各组件再各自维护色表。
 */
export const CATEGORY_COLORS: Record<string, string> = {
  科技商业: 'var(--cat-tech)',
  每日资讯: 'var(--cat-news)',
  社会心理: 'var(--cat-psych)',
  生活文化: 'var(--cat-life)',
}

/** 未知类目的兜底色 */
export const CATEGORY_COLOR_FALLBACK = 'var(--text-muted)'
