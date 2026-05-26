# Obsidian 大分类文件夹写入与存量迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写入 Obsidian 时只按“核心大分类”创建顶层文件夹并落盘；提供设置页按钮对存量笔记按相同规则批量迁移归档。

**Architecture:** 新增一个基于 JSON 配置的“标签→大分类”评分引擎与文件名/目录名规范化工具。写入时解析 notes frontmatter 的 tags，计算唯一分类后写入对应目录。迁移时扫描 obsidian_dir 下所有 md，解析 tags 后移动到对应目录，重名自动改名。

**Tech Stack:** Electron(main/preload/renderer), TypeScript, Node fs/path, Node test runner (`node --test`).

---

## File Structure / Responsibilities

**Create (Main):**
- `src/main/obsidian-categories.ts`
  - 读取/初始化分类配置文件
  - tags 解析（frontmatter）
  - 标签→分类评分与优先级决胜
  - 目录名/文件名规范化
  - 存量迁移实现（scan + move + rename-on-collision）

**Modify (Main):**
- `src/main/podcast.ts`
  - 用 `obsidian-categories.ts` 替换现有 “firstTag 作为目录” 的逻辑，只写入顶层大分类目录
- `src/main/index.ts`
  - 新增 IPC：`obsidian:migrateNotes`（迁移按钮触发）

**Modify (Shared types / Config):**
- `src/shared/types.ts`
  - `PodcastConfig` 新增 `category_config_path?: string`（可选）
- `src/main/config.ts`
  - DEFAULTS 增加 `category_config_path` 的默认值（空字符串或固定文件名策略）

**Modify (Renderer):**
- `src/renderer/env.d.ts`
  - 暴露 `migrateObsidianNotes` API 类型
- `src/main/preload.ts`
  - 暴露 `migrateObsidianNotes` 给 renderer
- `src/renderer/components/SettingsDialog.tsx`
  - 新增“笔记分类”小节：显示配置文件路径（只读即可）+ “整理存量笔记”按钮
  - 迁移过程中禁用按钮并显示结果摘要

**Tests:**
- Create: `tests/obsidian-categories.test.mjs`
  - 评分决策、平局优先级、未知标签→其他
  - 目录/文件名规范化
  - 迁移：移动正确、重名自动改名、内容不变
- Modify: `tests/ui-theme-source.test.mjs`
  - 更新/移除对已删除组件 `RecentTasksSidebar.tsx` 的断言（修复当前测试失败）
- Modify: `tests/recent-task-state.test.mjs`, `tests/whisper-progress.test.mjs`
  - 避免直接 `import` `.ts` 源码导致 Node ESM Unknown extension（改为读取源码文本并 regex 断言，或改为测试 dist-electron 产物）

---

## Category Config Spec (JSON)

**Default config file location**
- Default: `${obsidian_dir}/podcast_categories.json`
- If `config.category_config_path` 非空，则使用该路径（允许用户未来自定义放置位置）。

**Schema**

```json
{
  "version": 1,
  "categories": [
    { "id": "tech", "name": "科技类", "priority": 100 },
    { "id": "business", "name": "商业财经类", "priority": 90 },
    { "id": "culture", "name": "文化艺术类", "priority": 80 },
    { "id": "history", "name": "历史社科类", "priority": 70 },
    { "id": "career", "name": "职场成长类", "priority": 60 },
    { "id": "life", "name": "生活方式类", "priority": 50 },
    { "id": "science", "name": "学术科普类", "priority": 40 },
    { "id": "other", "name": "其他", "priority": 0 }
  ],
  "rules": [
    { "match": "AI应用", "categoryId": "tech", "weight": 3 },
    { "match": "科技前沿", "categoryId": "tech", "weight": 2 },
    { "match": "科技巨头", "categoryId": "business", "weight": 2 },
    { "match": "商业动态", "categoryId": "business", "weight": 2 },
    { "match": "消费心理学", "categoryId": "life", "weight": 2 },
    { "match": "比较政治经济学", "categoryId": "history", "weight": 2 }
  ]
}
```

**Match semantics**
- `match` 默认对 tag 做“完全匹配”（case-sensitive）。后续如需关键词/正则，另行扩展（本期不做）。

---

## Task 1: Add tests for category engine (TDD)

**Files:**
- Create: `tests/obsidian-categories.test.mjs`

- [ ] **Step 1: Write failing tests for scoring & tie-break**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

test('category scoring selects highest score', async () => {
  const { pickCategoryName } = await import('../dist-electron/main/obsidian-categories.mjs')
  const cfg = {
    version: 1,
    categories: [
      { id: 'tech', name: '科技类', priority: 100 },
      { id: 'business', name: '商业财经类', priority: 90 },
      { id: 'other', name: '其他', priority: 0 },
    ],
    rules: [
      { match: 'AI应用', categoryId: 'tech', weight: 3 },
      { match: '资本开支', categoryId: 'business', weight: 3 },
    ],
  }
  assert.equal(pickCategoryName(['AI应用'], cfg), '科技类')
})

test('tie-break uses priority', async () => {
  const { pickCategoryName } = await import('../dist-electron/main/obsidian-categories.mjs')
  const cfg = {
    version: 1,
    categories: [
      { id: 'tech', name: '科技类', priority: 10 },
      { id: 'business', name: '商业财经类', priority: 20 },
      { id: 'other', name: '其他', priority: 0 },
    ],
    rules: [
      { match: 'A', categoryId: 'tech', weight: 1 },
      { match: 'B', categoryId: 'business', weight: 1 },
    ],
  }
  assert.equal(pickCategoryName(['A', 'B'], cfg), '商业财经类')
})

test('unknown tags go to 其他', async () => {
  const { pickCategoryName } = await import('../dist-electron/main/obsidian-categories.mjs')
  const cfg = {
    version: 1,
    categories: [
      { id: 'tech', name: '科技类', priority: 10 },
      { id: 'other', name: '其他', priority: 0 },
    ],
    rules: [],
  }
  assert.equal(pickCategoryName(['完全未知'], cfg), '其他')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:
```bash
node --test tests/obsidian-categories.test.mjs
```

Expected: FAIL because `dist-electron/main/obsidian-categories.mjs` does not exist yet.

---

## Task 2: Implement category config + scorer (minimal)

**Files:**
- Create: `src/main/obsidian-categories.ts`
- Modify: `vite` / build config only if needed to output the module for tests

- [ ] **Step 1: Implement config types and scorer**

```ts
export interface CategoryConfig {
  version: 1
  categories: Array<{ id: string; name: string; priority: number }>
  rules: Array<{ match: string; categoryId: string; weight: number }>
}

export function pickCategoryName(tags: string[], cfg: CategoryConfig): string {
  const byId = new Map(cfg.categories.map(c => [c.id, c]))
  const score = new Map<string, number>()
  for (const c of cfg.categories) score.set(c.id, 0)

  for (const tag of tags) {
    for (const rule of cfg.rules) {
      if (rule.match === tag && byId.has(rule.categoryId)) {
        score.set(rule.categoryId, (score.get(rule.categoryId) || 0) + rule.weight)
      }
    }
  }

  const other = cfg.categories.find(c => c.id === 'other')?.name || '其他'
  let bestId: string | null = null
  let bestScore = 0
  let bestPriority = -Infinity
  for (const c of cfg.categories) {
    const s = score.get(c.id) || 0
    if (s <= 0) continue
    if (s > bestScore || (s === bestScore && c.priority > bestPriority)) {
      bestId = c.id
      bestScore = s
      bestPriority = c.priority
    }
  }
  if (!bestId) return other
  return byId.get(bestId)!.name
}
```

- [ ] **Step 2: Ensure build exports testable artifact**
  - If the project does not produce ESM for tests, change the test to import from TS through existing build system, or test by reading source via `fs.readFileSync` and `vm` (prefer simplest working approach in this repo).

- [ ] **Step 3: Re-run tests**

Run:
```bash
node --test tests/obsidian-categories.test.mjs
```

Expected: PASS for the three tests.

---

## Task 3: Parse tags from markdown frontmatter

**Files:**
- Modify: `src/main/obsidian-categories.ts`
- Test: `tests/obsidian-categories.test.mjs`

- [ ] **Step 1: Add tag parser tests**

```js
test('parseTags supports inline array', async () => {
  const { parseTagsFromMarkdown } = await import('../dist-electron/main/obsidian-categories.mjs')
  const md = `---\ntags: [AI应用, 个人成长]\n---\n# x\n`
  assert.deepEqual(parseTagsFromMarkdown(md), ['AI应用', '个人成长'])
})
```

- [ ] **Step 2: Implement `parseTagsFromMarkdown(md)`**
  - Only parse within first `--- ... ---`
  - Support inline `tags: [a, b]` and YAML list:
    ```
    tags:
      - a
      - b
    ```

- [ ] **Step 3: Run tests**

Run:
```bash
node --test tests/obsidian-categories.test.mjs
```

Expected: PASS

---

## Task 4: Implement safe folder/file naming + collision rename

**Files:**
- Modify: `src/main/obsidian-categories.ts`
- Test: `tests/obsidian-categories.test.mjs`

- [ ] **Step 1: Add tests for normalization**
  - `sanitizePathSegment` replaces `< > : " / \\ | ? *` and whitespace control chars with `_`
  - trim result; if empty -> fallback name

- [ ] **Step 2: Add `resolveUniquePath(dir, baseName, ext)`**
  - If `baseName.md` exists, try `baseName (1).md`, `baseName (2).md`...

- [ ] **Step 3: Run tests**

---

## Task 5: Wire into podcast write path (new notes)

**Files:**
- Modify: `src/main/podcast.ts`

- [ ] **Step 1: Replace current tag->dir logic**
  - Read category config from `${obsidianDir}/podcast_categories.json` (or configured path)
  - If config missing, create default config file once (with the 8 categories + empty rules)
  - Parse tags from `notes.content` (frontmatter)
  - Compute category name
  - `saveDir = path.join(obsDir, sanitize(categoryName))`

- [ ] **Step 2: Keep original tags in markdown**
  - Do not edit `notes.content`

- [ ] **Step 3: Ensure write collision uses the same naming strategy**
  - Use `resolveUniquePath(...)` instead of timestamp approach

- [ ] **Step 4: Smoke test build**

Run:
```bash
npm run build:test
```

Expected: build succeeds.

---

## Task 6: Add IPC + preload API for migration

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/env.d.ts`

- [ ] **Step 1: Add IPC handler**
  - `ipcMain.handle('obsidian:migrateNotes', async () => { ... })`
  - Load config, call `migrateExistingNotes(obsidianDir, configPath?)`, return summary object:
    - `{ scanned, moved, renamed, skipped, errors: string[] }`

- [ ] **Step 2: Expose in preload**

```ts
migrateObsidianNotes: () => ipcRenderer.invoke('obsidian:migrateNotes'),
```

- [ ] **Step 3: Update renderer types**

```ts
migrateObsidianNotes: () => Promise<{ scanned: number; moved: number; renamed: number; skipped: number; errors: string[] }>
```

---

## Task 7: Add Settings UI entry (button trigger)

**Files:**
- Modify: `src/renderer/components/SettingsDialog.tsx`

- [ ] **Step 1: Add local state for migration running + result**
  - `const [migrating, setMigrating] = useState(false)`
  - `const [migrateResult, setMigrateResult] = useState<...>(null)`

- [ ] **Step 2: Add a new section**
  - Title: “笔记分类”
  - Copy: 说明“按大分类归档，保留 tags，不按细分标签建目录”
  - Button: “整理存量笔记”
  - Disable when `migrating` true
  - Show summary after completion

---

## Task 8: Implement migration logic

**Files:**
- Modify: `src/main/obsidian-categories.ts`
- Test: `tests/obsidian-categories.test.mjs`

- [ ] **Step 1: Add migration tests (temp folder)**
  - Use `fs.mkdtempSync` under OS temp
  - Create mock obsidian dir with nested folders and md files with frontmatter tags
  - Run `migrateExistingNotes(root, cfg)`
  - Assert:
    - file content unchanged
    - file moved to `<CategoryName>/...`
    - name collision creates `(1)` suffix

- [ ] **Step 2: Implement `migrateExistingNotes(obsidianDir, cfgPath?)`**
  - Skip category config file itself
  - Only handle `.md`
  - For files without tags: category = 其他
  - Do not move files already in correct category folder (count as skipped)
  - Gather errors into `errors[]` but continue processing

- [ ] **Step 3: Run tests**

---

## Task 9: Fix existing failing tests in repo

**Files:**
- Modify: `tests/ui-theme-source.test.mjs`
- Modify: `tests/recent-task-state.test.mjs`
- Modify: `tests/whisper-progress.test.mjs`

- [ ] **Step 1: Remove/Update assertion reading deleted `RecentTasksSidebar.tsx`**
  - Replace with `ActiveTasksPanel.tsx` + `RecentTasksPanel.tsx` assertions (already exist elsewhere)

- [ ] **Step 2: Remove direct TS imports in tests**
  - Replace with source-text assertions:
    - `fs.readFileSync('src/main/recent-task-state.ts','utf8')` then `assert.match(...)`
    - same for `src/main/whisper-progress.ts`

- [ ] **Step 3: Run full test suite**

Run:
```bash
node --test
```

Expected: all pass.

---

## Task 10: Build + Deploy verification

- [ ] Run:
```bash
npm run refresh:test
```

Expected:
- Build succeeds
- Deploy overwrites `g:\\Podcast_Notes\\dist-exe\\win-unpacked`

Manual sanity checks (user):
- 新生成笔记落到大分类目录
- 设置页按钮可触发迁移并显示摘要

