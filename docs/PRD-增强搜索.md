# PRD — 增强搜索

**需求 ID：** ICE 10.5（排名 8）
**版本：** v1.12.0
**状态：** 规划中
**创建日期：** 2026-07-19
**关联：** [用户故事-增强搜索.md](./用户故事-增强搜索.md)

---

## 1. 背景与目标

### 1.1 背景

当前 `search:notes` IPC 用 `String.toLowerCase().includes()` 子串匹配，硬上限 30 条，无 facet、无高亮、无排序、无分页、无字段过滤。用户笔记规模增长到几十期后，现有搜索无法满足"精准定位"的需求。

### 1.2 目标

| 维度 | 现状 | 目标 |
|------|------|------|
| 检索 | 子串匹配 | 字段权重 + bigram 中文分词 |
| 排序 | 文件系统遍历顺序 | score 降序 / date 降序 / date 升序（可切换）|
| 过滤 | 无 | category / tags / show / dateRange / entities |
| Facet | 无 | categories / tags / shows / dateRange / topEntities |
| 分页 | 30 条硬截断 | limit + offset，返回 total |
| 高亮 | 无 | excerpt 中关键词包裹 `<mark>` |
| UI | 顶栏 Ctrl+K 弹窗 | 侧边栏独立"搜索" tab + 顶栏保留 |

### 1.3 非目标

- 不引入 lunr / flexsearch / fuse.js 等外部搜索库
- 不做语义搜索（需 embedding + 向量库）
- 不引入 jieba 中文分词（采用字符级 bigram）
- 不做搜索历史 / 搜索结果导出
- 不替换顶栏 Ctrl+K 快捷搜索（保留作为快速入口）

---

## 2. 类型定义

```typescript
// src/main/search.ts （新文件）

export interface SearchParams {
  keyword: string                  // 关键词，可空（仅靠 facet 过滤）
  filters?: {
    category?: string              // 单选，AND
    tags?: string[]                // 多选，OR
    show?: string                  // 单选，AND
    dateFrom?: string              // YYYY-MM-DD，闭区间
    dateTo?: string                // YYYY-MM-DD，闭区间
    entityRefs?: string[]          // 实体名数组，最多 3 个，OR 关系
  }
  sortBy?: 'score' | 'date_desc' | 'date_asc'  // 默认 score
  limit?: number                   // 默认 50
  offset?: number                  // 默认 0
}

export interface SearchResult {
  path: string
  title: string                    // frontmatter.title 优先，回退文件名
  date?: string
  category?: string
  show?: string
  tags: string[]
  excerpt: string                 // 含 <mark>...</mark> 高亮
  matchType: ('title' | 'content' | 'tags')[]  // 命中的字段
  score: number                   // 命中次数 × 字段权重
}

export interface SearchResponse {
  results: SearchResult[]
  total: number                    // 满足条件的总数
  facets: SearchFacets            // 当前过滤条件下的 facet（用于二次过滤）
}

export interface SearchFacets {
  categories: { value: string; count: number }[]
  tags: { value: string; count: number }[]        // 按 count 降序
  shows: { value: string; count: number }[]       // 按 count 降序
  dateRange: { earliest?: string; latest?: string }
  topEntities: { value: string; type: string; count: number }[]  // Top 20
}
```

---

## 3. 数据流

```
┌──────────────────┐  SearchParams    ┌──────────────────┐
│  SearchPanel     │ ──────────────► │  search:enhanced  │
│  (renderer)      │                  │  (main, 新建)     │
│                  │                  │                  │
│                  │  SearchResponse  │  1. buildPodcastFileMap (复用)
│                  │ ◄──────────────  │  2. parseFrontmatter (扩展)
│                  │                  │  3. bigram tokenize
│                  │                  │  4. score + filter + sort
│                  │                  │  5. build facets
│                  │                  └──────────────────┘
│                  │  SearchFacets    ┌──────────────────┐
│                  │ ──────────────► │  search:facets   │
│                  │ ◄──────────────  │  (单独 IPC, 缓存) │
└──────────────────┘                  └──────────────────┘
```

**关键设计决策：**

1. **不建持久化倒排索引**：每次搜索实时扫描 Obsidian 目录。理由：
   - 用户笔记规模通常 <500 篇，实时扫描 <800ms，可接受
   - 避免索引失效、文件监听、启动预热的复杂度
   - 与 `buildTagIndex` / `buildBacklinkIndex` 保持一致的"按需扫描"模式

2. **facet 单独 IPC**：`search:facets` 返回当前库的全量 facet（不带 keyword 过滤），用于首次加载 facet 面板。带 keyword 的搜索走 `search:enhanced` 并返回 `SearchResponse.facets`（已根据 keyword + filters 过滤过的 facet）。

3. **facet 缓存**：用模块级变量 `cachedFacets` + Obsidian 目录的 `mtime` 做失效判断。同一次会话内若目录 mtime 未变，直接复用缓存。

4. **中文分词**：使用字符级 bigram。例如 "大语言模型" → ["大语", "语言", "言模", "模型"]。中文 + 英文混合时，英文按空格/标点切分为单词，中文段做 bigram。这是 flexsearch 也采用的简化策略，对中文搜索够用。

---

## 4. 算法设计

### 4.1 分词

```typescript
function tokenize(query: string): string[] {
  const tokens: string[] = []
  // 英文：按非字母数字字符切分，转小写
  const englishWords = query.toLowerCase().match(/[a-z0-9]+/g) || []
  tokens.push(...englishWords)
  // 中文：连续的中文字符段做 bigram
  const chineseSegments = query.match(/[\u4e00-\u9fff]+/g) || []
  for (const seg of chineseSegments) {
    if (seg.length === 1) {
      tokens.push(seg)
    } else {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.substring(i, i + 2))
      }
    }
  }
  return tokens
}
```

### 4.2 匹配与评分

对每个笔记，按字段计算命中次数：

| 字段 | 权重 | 匹配方式 |
|------|------|---------|
| title | 5 | 任一 token 命中 +5 × 命中 token 数 |
| tags | 3 | 任一 tag 包含任一 token +3 × 命中数 |
| content | 1 | bigram 命中次数 × 1 |

```
score = titleScore * 5 + tagsScore * 3 + contentScore * 1
```

如果 `keyword` 为空但 `filters` 非空（纯 facet 检索），所有结果 score=0，按 date 降序。

### 4.3 高亮 excerpt

- 找到 content 中第一个命中的 token 位置
- 取前后各 80 字符
- 所有命中 token 用 `<mark>...</mark>` 包裹
- HTML 转义（防 XSS）

### 4.4 facet 二次过滤

`SearchResponse.facets` 是**当前过滤条件下**的 facet。例如：
- 用户选了 `category=科技商业`，则返回的 `tags` facet 只统计科技商业分类下的标签
- 用户又选了 `tags=[AI]`，则返回的 `shows` facet 只统计科技商业+AI 标签的节目

这避免用户选出 0 结果的组合。

---

## 5. 文件变更

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/search.ts` | 搜索核心逻辑：tokenize / score / filter / facets |
| `src/renderer/components/SearchPanel.tsx` | 搜索独立视图 UI |

### 5.2 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/backlinks.ts` | `parseFrontmatter` 扩展支持 `title`、`host`、`guest`、`platform` 字段；`FrontmatterMeta` 接口扩展 |
| `src/main/ipc/search-ipc.ts` | 新增 `search:enhanced` + `search:facets` 两个 IPC handler（保留原 `search:notes`） |
| `src/main/preload.ts` | 新增 `searchEnhanced(params)` + `searchFacets()` 桥接 |
| `src/renderer/env.d.ts` | 新增 `SearchParams` / `SearchResult` / `SearchResponse` / `SearchFacets` 类型声明 + electronAPI 扩展 |
| `src/renderer/components/WorkspaceSidebar.tsx` | `SidebarView` 类型加 `'search'`；nav 加"搜索"按钮（图标 `Search`） |
| `src/renderer/App.tsx` | `activeView === 'search'` 时渲染 `<SearchPanel />` |
| `src/renderer/App.css` 或全局样式 | 新增 `.search-panel` 系列样式 |

### 5.3 不修改

- `src/renderer/components/Header.tsx`（顶栏 Ctrl+K 搜索保留，不动）
- `src/renderer/components/BacklinkPanel.tsx`（不冲突，复用 backlinks 数据但不改它的代码）
- `src/renderer/components/CommandPalette.tsx`（命令面板不动）

---

## 6. 接口契约

### 6.1 `search:enhanced`

**Request:**

```typescript
ipcRenderer.invoke('search:enhanced', params: SearchParams): Promise<SearchResponse>
```

**Response:**

```typescript
{
  results: SearchResult[],
  total: number,
  facets: SearchFacets
}
```

**异常处理：**
- `obsidian_dir` 未配置 → 返回 `{ results: [], total: 0, facets: 空对象 }`
- 扫描目录抛错 → 同上
- 参数校验失败（limit > 200 / offset < 0）→ 用默认值替代

### 6.2 `search:facets`

**Request:**

```typescript
ipcRenderer.invoke('search:facets'): Promise<SearchFacets>
```

返回当前 Obsidian 库的**全量** facet（无 keyword、无 filters），用于首次加载 facet 面板。带 mtime 缓存。

---

## 7. UI 设计

### 7.1 侧边栏新增

`WorkspaceSidebar.tsx` nav 加第 3 个按钮：

```
[图标 LayoutDashboard] 工作台
[图标 Link2]         知识关联
[图标 Search]         搜索          ← 新增
```

### 7.2 SearchPanel 布局

```
┌─────────────────────────────────────────────────────────┐
│  [搜索关键词...] [相关度 ▼]                              │
├──────────┬──────────────────────────────────────────────┤
│  分类    │  ┌──────────────────────────────────────┐    │
│  ○ 全部  │  │ #AI 创业者的产品思维                  │    │
│  ◉ 科技  │  │ 2026-07-15 · 科技商业 · 小宇宙        │    │
│  ○ 每日  │  │ tags: [AI] [创业] [大语言模型]        │    │
│  ○ 社会  │  │ ...content with <mark>keyword</mark> │    │
│  ○ 生活  │  └──────────────────────────────────────┘    │
│          │  ┌──────────────────────────────────────┐    │
│  标签    │  │ ...下一张结果卡片                    │    │
│  ☑ AI    │  └──────────────────────────────────────┘    │
│  ☐ 创业  │                                              │
│  ☐ 大模型│  [‹ 上一页] 第 1-50 条/共 87 条 [下一页 ›]    │
│          │                                              │
│  节目    │                                              │
│  ☑ 小宇宙 │                                             │
│  ☐ 知行   │                                             │
│          │                                              │
│  日期范围 │                                             │
│  从 [____]│                                             │
│  到 [____]│                                             │
│          │                                              │
│  实体    │                                              │
│  Top 20  │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 7.3 交互细节

- 搜索输入防抖 300ms
- facet 多选/单选即时更新
- 点击结果卡片 → `window.electronAPI.openPath(path)` 用系统默认程序打开
- 分页：limit=50，底部上一页/下一页按钮
- 空状态：搜索框为空且无 filter 时显示"输入关键词或选择筛选条件开始搜索"
- 0 结果：显示"未找到相关笔记，试试调整筛选条件"

### 7.4 样式

沿用 BacklinkPanel 的 CSS 风格（同色调、同字号、同圆角），新 class 前缀 `.search-panel__*`。

---

## 8. 性能要求

| 场景 | 目标 |
|------|------|
| 100 篇笔记全量搜索 | <300ms |
| 500 篇笔记全量搜索 | <800ms |
| 1000 篇笔记全量搜索 | <1500ms |
| facet 缓存命中 | <50ms |
| facet 首次构建 | 同全量搜索 |

---

## 9. 验收标准

对应 [用户故事-增强搜索.md](./用户故事-增强搜索.md) 中的 US-001 ~ US-004，全部通过即视为完成。

关键测试用例：

1. **关键词搜索**：搜"AI"，返回所有 title/content/tags 命中"AI"的笔记，按 score 降序。
2. **中文分词**：搜"大语言模型"，能命中"大模型时代"（共享 bigram "大模"）和"语言模型"（共享 "语言"）。
3. **facet 过滤**：选 category=科技商业 后，tags facet 不再显示"心理健康"等社会心理分类下的标签。
4. **日期范围**：dateFrom=2026-06-01，只返回 6 月后的笔记。
5. **实体过滤**：选择实体"张三"，只返回 buildBacklinkIndex 中张三的反链列表。
6. **分页**：limit=10，offset=20，返回第 3 页结果，total 不变。
7. **高亮**：excerpt 含 `<mark>关键词</mark>`，前端正确渲染黄色背景。
8. **空搜索**：keyword 为空 + filters 有值 → 返回满足 filters 的所有笔记按 date 降序。
9. **0 结果**：搜不存在的关键词，返回 total=0、results=[]、facets 仍正常返回。

---

## 10. 风险与降级

| 风险 | 概率 | 应对 |
|------|------|------|
| 中文 bigram 召回过宽 | 中 | 在 score 中加 bigram 命中次数权重，长查询优先匹配多个连续 bigram |
| 笔记量 >2000 篇性能下降 | 低 | 留待用户反馈，必要时再加持久化索引 |
| `<mark>` 高亮 XSS | 低 | excerpt 构建时先 HTML escape，再插入 `<mark>` |
| facet 缓存失效判断错 | 低 | mtime 比较 + 手动刷新按钮（"刷新索引"） |
| 旧版 `search:notes` 被破坏 | 低 | 旧 IPC 完全不动，仅新增 IPC |

---

## 11. 发布计划

**版本：** v1.12.0（minor，新功能）

**里程碑：**
1. US-001 后端 + 类型 — 1 天
2. US-002 facet 后端 + 缓存 — 0.5 天
3. US-003 SearchPanel UI — 1 天
4. US-004 实体 facet — 0.5 天
5. 联调 + 文档 + 提交 — 0.5 天

**预计：** 3.5 天完成。

---

## 12. 不在本次范围

- 语义搜索（embedding + 向量相似度）
- 搜索历史 / 最近搜索
- 搜索结果导出（CSV/Markdown）
- 正则表达式搜索
- 跨多库搜索（Obsidian + 其他笔记平台）
- 实时增量索引（文件监听）
