# PRD：内容标签与聚类

**版本：** v1.11.0 | **日期：** 2026-06-23 | **状态：** 待实现

---

## 1. 概述

### 1.1 需求背景

播客笔记助手在 AI 生成笔记时已在 frontmatter 自动产出 `tags`（3-5 个主题标签）和 `category`（4 大分类），但这些数据未被利用。用户积累数十期笔记后，缺少按主题发现和跨笔记浏览的入口。本需求激活已有标签数据，提供标签索引、分类聚类和相关笔记推荐。

### 1.2 目标

- 激活已有 frontmatter tags 数据，提供标签浏览入口
- 按 4 大 category 聚类展示笔记分布
- 基于标签重合度推荐相关笔记
- 不增加 AI prompt 复杂度，纯前端 + 本地索引

### 1.3 范围

- **包含**：标签索引构建、标签云 UI、分类聚类视图、相关笔记推荐
- **不包含**：手动标签编辑、全文搜索、语义相似度、标签同义词合并

---

## 2. 现状分析

### 已有的标签基础设施

**frontmatter 格式**（AI 自动生成）：
```yaml
---
type: podcast
show: 《节目名称》
episode: 第X期
host: [主持人]
guest: [嘉宾]
date: 2026-06-23
tags: [AI, 创业, 大语言模型]
category: 科技商业
---
```

**backlinks.ts 现有能力**：
- `parseFrontmatter()` 已解析 date、category、show、type、episode（但未解析 tags）
- `buildPodcastFileMap()` 已扫描所有 .md 文件并建立文件映射
- `BacklinkEntry` 和 `PodcastRef` 已包含 category 字段

**BacklinkPanel.tsx 现有结构**：
- 左侧 Tab 切换（人物/项目/概念/术语）+ 实体列表
- 右侧详情面板（实体时间线、对比、图谱三种模式）
- 搜索框、统计栏、刷新按钮
- 由 App.tsx 的 `activeView === 'backlinks'` 控制显示

**缺失部分**：
- frontmatter tags 字段未被解析
- 无标签索引数据结构
- 无标签浏览 UI
- 无分类聚类视图

---

## 3. 功能设计

### 3.1 US-001：标签索引与标签云（P0）

#### 3.1.1 标签索引构建

**后端 — `backlinks.ts` 新增**：

```typescript
// 新增类型
export interface TagEntry {
  tagName: string
  count: number          // 出现在多少篇笔记中
  podcastRefs: TagPodcastRef[]
}

export interface TagPodcastRef {
  path: string
  title: string
  date?: string
  category?: string
  show?: string
  tags: string[]         // 该笔记的所有标签（用于相关推荐）
}

export type TagIndex = TagEntry[]

// 新增函数
export function buildTagIndex(obsidianDir: string): TagIndex
```

**实现逻辑**：
1. 复用 `buildPodcastFileMap()` 获取所有 .md 文件路径
2. 对每个文件调用 `parseFrontmatter()`，新增 tags 字段解析
3. frontmatter 中的 `tags: [AI, 创业]` 需解析 YAML 数组格式
4. 构建 `Map<tagName, TagPodcastRef[]>` 索引
5. 转为数组按 count 降序排序

**frontmatter tags 解析**（扩展 `parseFrontmatter`）：
```typescript
// 在 FrontmatterMeta 中新增
interface FrontmatterMeta {
  date?: string
  category?: string
  show?: string
  type?: string
  episode?: string
  tags?: string[]   // 新增
}

// 解析逻辑
if (key === 'tags') {
  // 格式: tags: [AI, 创业, 大语言模型]
  const arrMatch = value.match(/^\[(.+)\]$/)
  if (arrMatch) {
    meta.tags = arrMatch[1].split(',').map(t => t.trim().replace(/["']/g, ''))
  }
}
```

#### 3.1.2 IPC 通道

**`src/main/ipc/index.ts` 新增**：
```typescript
ipcMain.handle('tags:getIndex', async () => {
  const config = loadConfig()
  if (!config.obsidian_dir) return []
  return buildTagIndex(config.obsidian_dir)
})
```

**`src/main/preload.ts` 新增**：
```typescript
getTagIndex: () => ipcRenderer.invoke('tags:getIndex')
```

**`src/renderer/env.d.ts` 新增**：
```typescript
getTagIndex: () => Promise<TagIndex>
```

#### 3.1.3 标签云 UI

**BacklinkPanel.tsx 改造**：

在现有实体 Tab 之上新增顶层视图切换：「实体」和「标签」两个顶级 Tab。

```
┌─────────────────────────────────────────────┐
│  [实体] [标签]              🔄 刷新          │
├─────────────────────────────────────────────┤
│  实体视图（现有）            或    标签视图    │
│  人物|项目|概念|术语              分类概览     │
│  实体列表 + 详情面板              标签云       │
│                                  标签展开列表  │
└─────────────────────────────────────────────┘
```

**标签视图布局**：
```
┌─────────────────────────────────────────────┐
│  分类概览                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │科技商业│ │每日资讯│ │社会心理│ │生活文化│        │
│  │ 12篇  │ │ 5篇   │ │ 3篇   │ │ 2篇   │        │
│  └──────┘ └──────┘ └──────┘ └──────┘        │
├─────────────────────────────────────────────┤
│  标签云                                       │
│  AI(8)  创业(5)  大语言模型(4)  投资(3)       │
│  播客(3)  生产力(2)  读书(2)  ...            │
├─────────────────────────────────────────────┤
│  点击标签后展开：                              │
│  ┌─ AI (8篇) ─────────────────────────────┐  │
│  │ 📄 笔记标题A  2026-06-20  科技商业       │  │
│  │ 📄 笔记标题B  2026-06-18  科技商业       │  │
│  │ 📄 笔记标题C  2026-06-15  每日资讯       │  │
│  └────────────────────────────────────────┘  │
│  相关实体：[[张三]] [[OpenAI]] [[RAG]]        │
└─────────────────────────────────────────────┘
```

**标签云字号映射**：
```typescript
function getTagFontSize(count: number, maxCount: number): number {
  const min = 12, max = 24
  const ratio = maxCount > 0 ? count / maxCount : 0
  return Math.round(min + (max - min) * ratio)
}
```

**分类概览颜色**（与现有 category 颜色统一）：
```typescript
const CATEGORY_COLORS: Record<string, string> = {
  '科技商业': 'var(--accent)',
  '每日资讯': 'var(--warning)',
  '社会心理': 'var(--success)',
  '生活文化': 'var(--text-muted)',
}
```

### 3.2 US-002：分类聚类视图（P1）

在标签视图的"分类概览"卡片上点击，筛选下方标签云仅显示该分类下的标签。

**交互逻辑**：
1. 点击分类卡片 → `activeCategory` 状态更新
2. 标签云过滤：仅显示 `podcastRefs` 中包含该 category 的标签
3. 再次点击同一分类 → 取消筛选
4. 筛选状态下标签云标题改为"科技商业 相关标签"

### 3.3 US-003：相关笔记推荐（P2）

在标签展开的笔记列表下方，显示"相关笔记推荐"。

**推荐算法**：
```typescript
function findRelatedNotes(
  targetPath: string,
  targetTags: string[],
  tagIndex: TagIndex
): { path: string; title: string; sharedTags: string[]; similarity: number }[] {
  const results: { path: string; title: string; sharedTags: string[]; similarity: number }[] = []

  for (const tag of tagIndex) {
    if (!targetTags.includes(tag.tagName)) continue
    for (const ref of tag.podcastRefs) {
      if (ref.path === targetPath) continue
      const shared = ref.tags.filter(t => targetTags.includes(t))
      // Jaccard 相似度 = 交集 / 并集
      const union = new Set([...targetTags, ...ref.tags]).size
      const similarity = shared.length / union
      results.push({ path: ref.path, title: ref.title, sharedTags: shared, similarity })
    }
  }

  // 去重（同一笔记可能从多个标签命中）并取 top 3
  const seen = new Map<string, typeof results[0]>()
  for (const r of results) {
    const existing = seen.get(r.path)
    if (!existing || r.similarity > existing.similarity) {
      seen.set(r.path, r)
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
}
```

---

## 4. 数据流

```
Obsidian 目录 .md 文件
    ↓
buildTagIndex(obsidianDir)
    ↓
IPC: tags:getIndex
    ↓
BacklinkPanel.tsx (TagIndex state)
    ↓
标签云 / 分类聚类 / 相关推荐 UI
```

---

## 5. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/backlinks.ts` | 修改 | 新增 `TagEntry`、`TagIndex` 类型和 `buildTagIndex()` 函数，扩展 `parseFrontmatter` 支持 tags |
| `src/main/ipc/index.ts` | 修改 | 新增 `tags:getIndex` IPC handler |
| `src/main/preload.ts` | 修改 | 新增 `getTagIndex` API 暴露 |
| `src/renderer/env.d.ts` | 修改 | 新增 `getTagIndex` 类型声明 |
| `src/renderer/components/BacklinkPanel.tsx` | 修改 | 新增顶层「实体/标签」视图切换，标签云组件，分类聚类，相关推荐 |
| `src/renderer/styles/globals.css` | 修改 | 新增标签云和分类卡片样式 |

---

## 6. 验收标准

### US-001 验收
- [ ] 知识关联面板新增"标签"顶级视图
- [ ] 标签云展示所有 tags，按频率排序，字号映射频率
- [ ] 点击标签展开笔记列表
- [ ] 笔记条目可点击在 Obsidian 中打开
- [ ] 标签云上方显示分类概览卡片

### US-002 验收
- [ ] 分类概览卡片显示 4 大分类及笔记数量
- [ ] 点击分类卡片筛选标签云
- [ ] 再次点击取消筛选

### US-003 验收
- [ ] 笔记列表下方显示"相关笔记推荐"
- [ ] 推荐基于 Jaccard 标签相似度，取 top 3
- [ ] 无相似笔记时显示"暂无相关笔记"
