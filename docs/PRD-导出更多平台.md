# PRD — 导出更多平台

**需求 ID：** ICE 6.0（排名 9）
**版本：** v1.13.0
**状态：** 规划中
**创建日期：** 2026-07-19
**关联：** [用户故事-导出更多平台.md](./用户故事-导出更多平台.md)

---

## 1. 背景与目标

### 1.1 背景

当前播客笔记生成后仅写入 Obsidian 库目录（`podcast.ts:578-582` 用 `fs.writeFileSync(filepath, notes.content, 'utf-8')`），无任何导出能力。`grep -ri "notion\|logseq\|exportTo"` 在 `src/` 零命中，`package.json` 也无 Notion SDK 依赖。

用户若同时使用 Logseq / Notion 维护知识库，必须手动复制粘贴，体验割裂。

### 1.2 目标

| 维度 | 现状 | 目标 |
|------|------|------|
| Markdown 导出 | 无 | 复制到任意目录，可选去除 wiki-link |
| Logseq 导出 | 无 | 配置 Logseq graph 目录后一键复制 |
| Notion 导出 | 无 | 通过 API 上传到指定 database，含 properties + 页面内容 |
| 触发方式 | 无 | RecentTask 完成卡片"导出"按钮手动触发 |
| 配置管理 | 无 | 设置面板"导出"分组 |
| 批量支持 | 无 | 不做（仅单任务） |

### 1.3 非目标

- 不引入 `@notionhq/client` 官方 SDK（用 `fetch` 调 REST API）
- 不引入 markdown 解析库（`marked` / `remark`），用极简按行字符串解析
- 不做批量导出 / 自动导出 / 飞书云文档导出
- 不做导出历史记录

---

## 2. 类型定义

```typescript
// src/main/exporter.ts （新文件）

// 导出目标平台
export type ExportTarget = 'markdown' | 'logseq' | 'notion'

// 通用入参
export interface ExportParams {
  taskId: string                    // RecentTask ID，用于查 notePath
  target: ExportTarget
  targetDir?: string                // markdown 平台必填（用户选择的目录）
  stripObsidianSyntax?: boolean     // markdown 平台可选，默认 false
}

// 通用出参
export interface ExportResult {
  success: boolean
  outputPath?: string               // markdown/logseq 的绝对路径
  pageUrl?: string                  // notion 的页面 URL
  pageId?: string                   // notion 的页面 ID
  error?: string                    // 失败时的中文错误
}

// Notion 配置（持久化到 podcast_config.json.export.notion）
export interface NotionConfig {
  token: string                     // Integration Token
  databaseId: string                // 目标 database ID
}

// 完整导出配置
export interface ExportConfig {
  logseq_dir: string
  notion: NotionConfig
}

// Notion 测试连接入参/出参
export interface NotionTestConnectionParams {
  token: string
  databaseId: string
}
export interface NotionTestConnectionResult {
  success: boolean
  databaseTitle?: string
  error?: string
}

// Notion API 响应类型（精简）
interface NotionPageResponse {
  id: string
  url: string
  object: 'page'
}
interface NotionErrorResponse {
  status: number
  code: string
  message: string
}
```

```typescript
// src/main/notion-converter.ts （新文件，markdown→Notion blocks 转换）

// Notion block 类型（精简，只覆盖本项目用到的）
export type NotionBlock =
  | { type: 'heading_1'; heading_1: { rich_text: NotionRichText[] } }
  | { type: 'heading_2'; heading_2: { rich_text: NotionRichText[] } }
  | { type: 'heading_3'; heading_3: { rich_text: NotionRichText[] } }
  | { type: 'paragraph'; paragraph: { rich_text: NotionRichText[] } }
  | { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: NotionRichText[] } }
  | { type: 'numbered_list_item'; numbered_list_item: { rich_text: NotionRichText[] } }
  | { type: 'quote'; quote: { rich_text: NotionRichText[] } }
  | { type: 'to_do'; to_do: { rich_text: NotionRichText[]; checked: boolean } }
  | { type: 'divider'; divider: {} }
  | { type: 'code'; code: { rich_text: NotionRichText[]; language: string } }

export interface NotionRichText {
  type: 'text'
  text: { content: string; link?: { url: string } | null }
  annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: string }
}

// Notion database properties（写入 page 时的 properties 字段）
export interface NotionPageProperties {
  // title 是 Notion database 的主键列
  [propertyName: string]: {
    type: 'title' | 'rich_text' | 'date' | 'select' | 'multi_select' | 'url' | 'checkbox' | 'number'
    [key: string]: unknown
  }
}
```

---

## 3. 数据流

```
┌─────────────────────┐  ExportParams    ┌──────────────────────┐
│  RecentTask 卡片     │ ──────────────► │  export:to{Platform} │
│  (renderer)         │                  │  (main, 新建)         │
│                     │                  │                       │
│  [导出按钮▼]         │  ExportResult    │  1. 由 taskId 查 notePath
│  ├─ Markdown…       │ ◄──────────────  │  2. 读取源 .md 内容
│  ├─ Logseq          │                  │  3. 按平台分支：
│  └─ Notion          │                  │     - markdown: copy + stripWikiLink
│                     │                  │     - logseq: copy (保留原样)
└─────────────────────┘                  │     - notion: frontmatter→properties + markdown→blocks + POST /pages
                                          └──────────────────────┘
```

```
┌─────────────────────┐  NotionTestConn  ┌──────────────────────┐
│  SettingsPanel      │ ──────────────► │  export:notion:test  │
│  (renderer)         │                  │  (main, 新建)         │
│                     │  Result          │  GET /v1/databases/{id}
│  Token: ____        │ ◄──────────────  │  返回 databaseTitle 或错误
│  DatabaseID: ____   │                  └──────────────────────┘
│  [测试连接]          │
└─────────────────────┘
```

**关键设计决策：**

1. **以 `taskId` 为入口**：所有导出 IPC 入参只接 `taskId`，由后端通过 `recentTasks` 查 `notePath`。理由：
   - 不暴露文件路径给前端（避免用户篡改）
   - 复用现有 `recentTasks` 数据结构（`task-ipc.ts` 已实现 `getRecent`/`removeRecent`）
   - 与"手动触发"模式天然契合（用户从完成的任务卡片发起导出）

2. **不引入 Notion SDK**：直接 `fetch` 调用 Notion REST API。理由：
   - 项目惯例是依赖最小化（参考 `search.ts` 不用 lunr/flexsearch）
   - Notion REST API 简单（POST/GET JSON），SDK 反而增加 bundle 体积
   - 与项目其他 API 调用（OpenAI/飞书）风格一致

3. **markdown→blocks 极简按行解析**：不引入 `marked`。理由：
   - 播客笔记结构简单（标题/段落/列表/引用/分隔线），不涉及复杂语法（嵌套表格、HTML、复杂引用块）
   - 按行 `split('\n')` + 正则匹配 `^#{1,3} ` / `^> / `^-\s` / `^\d+\.\s` / `^---$` / `^``` `

4. **Notion 重复检测**：上传前 query database by title。理由：
   - 用户可能多次点击导出，需防止重复页面
   - 不做覆盖更新（Notion API 更新复杂，需 patch children）

5. **配置持久化复用现有路径**：扩展现有 `podcast_config.json` 加 `export` 字段。理由：
   - 用户已熟悉此配置文件
   - `config.ts` 已有 load/save 逻辑可复用

6. **Logseq 不做语法转换**：Logseq 与 Obsidian 都用 `[[wiki-link]]` 和 YAML frontmatter，直接复制即可。

---

## 4. 算法设计

### 4.1 源笔记路径查找

```typescript
function getNotePathByTaskId(taskId: string): string | null {
  // 复用 task-ipc.ts 的 recentTasks 数组
  const task = recentTasks.find(t => t.id === taskId)
  if (!task || !task.notePath) return null
  // notePath 是相对于 obsidian_dir 的路径，需拼接为绝对路径
  const config = loadConfig()
  const obsDir = config.obsidian_dir?.trim() || ''
  if (!obsDir) return null
  return path.isAbsolute(task.notePath) ? task.notePath : path.join(obsDir, task.notePath)
}
```

> **依赖：** `recentTasks` 数据结构需扩展 `notePath` 字段（若当前不存在）。需先确认 `task-ipc.ts` 中 task 对象是否已存 notePath（调研：`podcast.ts:582` 返回的相对路径在 `index.ts:229-238` 被存入 recentTasks，字段名需查证）。

### 4.2 复制核心函数

```typescript
async function copyNoteToDir(
  srcPath: string,
  targetDir: string,
  options: { stripObsidianSyntax?: boolean } = {}
): Promise<string> {
  // 1. 检查源文件存在
  await fs.promises.access(srcPath, fs.constants.R_OK)

  // 2. 检查目标目录可写
  await fs.promises.access(targetDir, fs.constants.W_OK)

  // 3. 读取源文件
  let content = await fs.promises.readFile(srcPath, 'utf-8')

  // 4. 可选：去除 Obsidian wiki-link
  if (options.stripObsidianSyntax) {
    content = stripWikiLinks(content)
  }

  // 5. 文件名冲突处理
  const originalName = path.basename(srcPath)
  let targetName = originalName
  let targetPath = path.join(targetDir, targetName)
  if (fs.existsSync(targetPath)) {
    const stem = path.parse(originalName).name
    const ext = path.parse(originalName).ext
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14) // YYYYMMDDHHmmss
    targetName = `${stem}_${timestamp}${ext}`
    targetPath = path.join(targetDir, targetName)
  }

  // 6. 写入
  await fs.promises.writeFile(targetPath, content, 'utf-8')
  return targetPath
}
```

### 4.3 去除 wiki-link 转换

```typescript
function stripWikiLinks(content: string): string {
  // [[xxx|alias]] → alias（有 alias 时取 alias）
  // [[xxx]]       → xxx（无 alias 时取链接目标）
  return content
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')  // [[xxx|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1')              // [[xxx]] → xxx
}
```

### 4.4 frontmatter → Notion properties

```typescript
function frontmatterToNotionProperties(
  frontmatter: Record<string, unknown>,
  databaseSchema: NotionDatabaseSchema
): NotionPageProperties {
  const props: NotionPageProperties = {}

  // title（必填）
  const title = (frontmatter.title as string) || (frontmatter.show as string) || ''
  if (databaseSchema.titleProperty) {
    props[databaseSchema.titleProperty] = {
      type: 'title',
      title: [{ text: { content: title } }]
    }
  }

  // rich_text 字段
  for (const key of ['show', 'episode', 'host', 'guest']) {
    if (frontmatter[key] && databaseSchema.properties[key]?.type === 'rich_text') {
      props[key] = {
        type: 'rich_text',
        rich_text: [{ text: { content: String(frontmatter[key]) } }]
      }
    }
  }

  // date 字段
  if (frontmatter.date && databaseSchema.properties.date?.type === 'date') {
    props.date = {
      type: 'date',
      date: { start: frontmatter.date as string }
    }
  }

  // select 字段
  for (const key of ['category', 'platform']) {
    if (frontmatter[key] && databaseSchema.properties[key]?.type === 'select') {
      props[key] = {
        type: 'select',
        select: { name: String(frontmatter[key]) }
      }
    }
  }

  // multi_select 字段（tags）
  if (frontmatter.tags && databaseSchema.properties.tags?.type === 'multi_select') {
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags]
    props.tags = {
      type: 'multi_select',
      multi_select: tags.map(t => ({ name: String(t) }))
    }
  }

  return props
}
```

> **注意：** 上传前会先 GET `/v1/databases/{id}` 拿到 database schema（包含每个 property 的 type 和 name），用 schema 决定哪些 frontmatter 字段能映射。database 中不存在的 property 会被 Notion API 拒绝，因此必须过滤。

### 4.5 markdown → Notion blocks

```typescript
function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split('\n')
  const blocks: NotionBlock[] = []

  let inCodeBlock = false
  let codeBuffer: string[] = []
  let codeLang = 'plain text'

  for (const line of lines) {
    // 代码块处理
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLang = line.substring(3).trim() || 'plain text'
        codeBuffer = []
      } else {
        blocks.push({
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: codeBuffer.join('\n') } }],
            language: codeLang
          }
        })
        inCodeBlock = false
      }
      continue
    }
    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    // 空行跳过
    if (!line.trim()) continue

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'divider', divider: {} })
      continue
    }

    // 标题
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = stripWikiLinks(headingMatch[2])
      const richText = [{ type: 'text', text: { content: text } }]
      blocks.push({
        type: `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3',
        [`heading_${level}`]: { rich_text: richText }
      } as NotionBlock)
      continue
    }

    // 引用
    if (line.startsWith('> ')) {
      const text = stripWikiLinks(line.substring(2))
      blocks.push({
        type: 'quote',
        quote: { rich_text: [{ type: 'text', text: { content: text } }] }
      })
      continue
    }

    // todo list
    const todoMatch = line.match(/^-\s+\[([x ])\]\s+(.*)$/)
    if (todoMatch) {
      const checked = todoMatch[1] === 'x'
      const text = stripWikiLinks(todoMatch[2])
      blocks.push({
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: text } }],
          checked
        }
      })
      continue
    }

    // 无序列表
    if (/^-\s+/.test(line)) {
      const text = stripWikiLinks(line.replace(/^-\s+/, ''))
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] }
      })
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const text = stripWikiLinks(line.replace(/^\d+\.\s+/, ''))
      blocks.push({
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: [{ type: 'text', text: { content: text } }] }
      })
      continue
    }

    // 普通段落
    blocks.push({
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: stripWikiLinks(line) } }] }
    })
  }

  return blocks
}
```

> **限制说明：**
> - 嵌套列表（缩进）拍平为同级列表，Notion API 嵌套 children 需单独 PATCH，本期不做
> - 表格不转换（播客笔记模板无表格）
> - 图片链接不转换（Notion 需 upload file，成本高）
> - 行内格式（`**粗体**` / `*斜体*` / `` `code` ``）转换保留为纯文本，不做 inline annotations（简化实现）

### 4.6 Notion API 调用

```typescript
async function notionFetch(pathname: string, init: RequestInit & { token: string }): Promise<Response> {
  const { token, ...rest } = init
  return fetch(`https://api.notion.com/v1${pathname}`, {
    ...rest,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...rest.headers
    }
  })
}

// 测试连接
async function testNotionConnection(token: string, databaseId: string): Promise<NotionTestConnectionResult> {
  try {
    const res = await notionFetch(`/databases/${databaseId}`, { token, method: 'GET' })
    if (res.status === 401) return { success: false, error: 'Integration Token 无效或已过期' }
    if (res.status === 404) return { success: false, error: 'Database 不存在或集成未共享该 database' }
    if (!res.ok) {
      const err = await res.json() as NotionErrorResponse
      return { success: false, error: `Notion API 错误: ${err.message}` }
    }
    const data = await res.json()
    return { success: true, databaseTitle: data.title?.[0]?.plain_text || '未命名' }
  } catch (e) {
    return { success: false, error: `网络错误: ${(e as Error).message}` }
  }
}

// 重复检测
async function findExistingNotionPage(token: string, databaseId: string, title: string): Promise<string | null> {
  const res = await notionFetch(`/databases/${databaseId}/query`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      filter: {
        property: 'title',  // 默认主键列名，需根据 schema 调整
        title: { equals: title }
      }
    })
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.url || null
}

// 创建页面
async function createNotionPage(params: {
  token: string
  databaseId: string
  properties: NotionPageProperties
  children: NotionBlock[]
}): Promise<{ pageId: string; pageUrl: string }> {
  const res = await notionFetch('/pages', {
    token: params.token,
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: params.databaseId },
      properties: params.properties,
      children: params.children.slice(0, 100)  // Notion 单次最多 100 blocks
    })
  })

  if (res.status === 401) throw new Error('Integration Token 无效或已过期')
  if (res.status === 404) throw new Error('Database 不存在')
  if (res.status === 400) {
    const err = await res.json() as NotionErrorResponse
    throw new Error(`参数错误: ${err.message}`)
  }
  if (res.status === 409) throw new Error('页面冲突（同名页面已存在）')
  if (res.status === 429) throw new Error('Notion API 速率限制，请稍后再试')
  if (!res.ok) {
    const err = await res.json() as NotionErrorResponse
    throw new Error(`Notion API 错误: ${err.message}`)
  }

  const data = await res.json() as NotionPageResponse
  return { pageId: data.id, pageUrl: data.url }
}
```

> **100 blocks 限制：** Notion POST `/pages` 的 `children` 单次最多 100 blocks。若笔记超长，需分批 PATCH `/blocks/{id}/children` 追加。本期对 ≤100 blocks 直接上传，超长笔记截断并日志警告（用户笔记普遍 <100 blocks）。

---

## 5. 文件变更

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/exporter.ts` | 导出核心逻辑：copyNoteToDir / stripWikiLinks / getNotePathByTaskId + 总入口 `exportNote(params)` |
| `src/main/notion-converter.ts` | Notion 专用：frontmatterToNotionProperties / markdownToNotionBlocks / notionFetch / testNotionConnection / createNotionPage / findExistingNotionPage |
| `src/main/ipc/export-ipc.ts` | IPC 注册：`export:toMarkdown` / `export:toLogseq` / `export:toNotion` / `export:notion:testConnection` |
| `src/renderer/components/ExportMenu.tsx` | RecentTask 卡片的导出下拉菜单组件 |

### 5.2 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/config.ts` | `AppConfig` 接口扩展 `export?: { logseq_dir?: string; notion?: { token?: string; database_id?: string } }`；`loadConfig` / `saveConfig` 自动包含 |
| `src/main/ipc/index.ts` | 注册新的 `export-ipc.ts` 模块（`registerExportIpc(mainWindow)`） |
| `src/main/preload.ts` | 新增 `exportToMarkdown(params)` / `exportToLogseq(params)` / `exportToNotion(params)` / `testNotionConnection(params)` 桥接 |
| `src/renderer/env.d.ts` | 新增 `ExportParams` / `ExportResult` / `NotionTestConnectionParams` / `NotionTestConnectionResult` 类型声明 + electronAPI 扩展 |
| `src/renderer/components/RecentTask` 或对应卡片组件 | 完成 task 卡片新增"导出"按钮 + 挂载 `<ExportMenu>` |
| `src/renderer/components/SettingsPanel` 或对应设置组件 | 新增"导出"分组：Logseq 目录配置 + Notion 配置 + 测试连接按钮 |
| `src/main/task-ipc.ts` 或 `src/main/index.ts`（recentTasks 定义处） | 确认 `recentTasks` 项是否已含 `notePath`；若无则补 |

### 5.3 不修改

- `src/main/podcast.ts`（写入主流程不动，导出是后置操作）
- `src/main/batch-queue.ts`（批量流程不接入导出）
- `src/main/podcast-dispatcher.ts`（飞书触发流程不接入导出）
- `src/renderer/components/WorkspaceSidebar.tsx`（不加导出 tab，触发入口在 RecentTask 卡片）

---

## 6. 接口契约

### 6.1 `export:toMarkdown`

**Request:**

```typescript
ipcRenderer.invoke('export:toMarkdown', {
  taskId: string
  targetDir: string
  stripObsidianSyntax?: boolean  // 默认 false
}): Promise<ExportResult>
```

**Response:**

```typescript
{ success: true, outputPath: '/path/to/笔记名.md' }
// 或
{ success: false, error: '源笔记文件不存在' }
```

**异常处理：**
- `taskId` 未找到 → `{ success: false, error: '任务不存在' }`
- `notePath` 为空 → `{ success: false, error: '任务尚未生成笔记' }`
- 源文件已被删除 → `{ success: false, error: '源笔记文件不存在' }`
- `targetDir` 不可写 → `{ success: false, error: '目标目录不可写，请检查权限' }`
- 文件名冲突 → 自动追加时间戳后缀，不报错
- 磁盘满 / 路径过长 → catch `NodeJS.ErrnoException`，按 code 映射

### 6.2 `export:toLogseq`

**Request:**

```typescript
ipcRenderer.invoke('export:toLogseq', { taskId: string }): Promise<ExportResult>
```

**Response:** 同 6.1

**异常处理：**
- `config.export.logseq_dir` 为空 → `{ success: false, error: '未配置 Logseq 目录，请在设置中配置' }`
- Logseq 目录不存在 → `{ success: false, error: 'Logseq 目录不存在，请检查路径' }`
- 其他同 6.1

### 6.3 `export:toNotion`

**Request:**

```typescript
ipcRenderer.invoke('export:toNotion', { taskId: string }): Promise<ExportResult>
```

**Response:**

```typescript
{ success: true, pageUrl: 'https://www.notion.so/...', pageId: 'xxx' }
// 或
{ success: false, error: 'Notion database 中已存在同名页面', pageUrl: 'https://...' }
```

**异常处理：**
- `config.export.notion.token` 或 `database_id` 为空 → 友好错误
- 网络错误 / 超时（30s） → `{ success: false, error: '网络错误：xxx' }`
- 401 / 404 / 429 → 按状态码映射
- 重复页面 → 返回 existingPageUrl，由前端提示用户

### 6.4 `export:notion:testConnection`

**Request:**

```typescript
ipcRenderer.invoke('export:notion:testConnection', {
  token: string
  databaseId: string
}): Promise<NotionTestConnectionResult>
```

**Response:**

```typescript
{ success: true, databaseTitle: '播客笔记' }
// 或
{ success: false, error: 'Integration Token 无效或已过期' }
```

---

## 7. UI 设计

### 7.1 RecentTask 完成卡片新增导出按钮

```
┌──────────────────────────────────────────────────┐
│ 任务 #abc123 已完成 ✓                            │
│ 笔记名：xxx  分类：科技商业                       │
│                                                   │
│ [在 Obsidian 中打开]  [导出 ▼]                    │
└──────────────────────────────────────────────────┘
```

点击"导出 ▼"弹出下拉菜单：

```
┌─────────────────────┐
│ Markdown…           │  → 弹出目录选择对话框
│ Logseq              │  → 直接调用 export:toLogseq
│ Notion              │  → 直接调用 export:toNotion
└─────────────────────┘
（未配置项禁用，悬停提示"在设置中配置"）
```

### 7.2 设置面板"导出"分组

```
┌──────────────────────────────────────────────────┐
│ 导出                                              │
│ ┌────────────────────────────────────────────┐   │
│ │ Logseq 目录                                 │   │
│ │ [G:\Logseq\notes                  ] [选择] │   │
│ │ 当前路径：G:\Logseq\notes                   │   │
│ └────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────┐   │
│ │ Notion 集成                                 │   │
│ │ Token: [**********************]             │   │
│ │ Database ID: [xxxxxxxxxxxxxxxx]            │   │
│ │ [测试连接]  状态：已连接（database: 播客笔记）│   │
│ │ 提示：在 Notion 中创建 integration 并分享目标 │   │
│ │       database 给该 integration             │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### 7.3 导出过程 UX

- 点击导出后按钮变为 spinner + "导出中..."（用 `useState` 控制 loading）
- 成功：toast 绿色通知"已导出到 {平台名}"，Markdown 提供打开目录链接（`shell:showInFolder`），Notion 提供打开页面链接（`shell:openExternal`）
- 失败：toast 红色通知显示具体错误
- 导出中按钮禁用，防止重复点击

### 7.4 样式

沿用 `RecentTask` 卡片现有 CSS 风格，导出按钮使用 lucide-react `Share` 图标。下拉菜单复用项目已有的 Popover 组件（如有），否则用 `@base-ui/react` 的 Menu。

---

## 8. 性能要求

| 场景 | 目标 |
|------|------|
| Markdown 复制（10KB 笔记） | <200ms |
| Markdown 复制（100KB 笔记） | <500ms |
| Logseq 复制 | 同上（复用 copyNoteToDir） |
| Notion 测试连接 | <3s |
| Notion 上传（50 blocks） | <5s |
| Notion 上传（100 blocks） | <10s |
| Notion 上传超时 | 30s 强制中断 |

---

## 9. 验收标准

对应 [用户故事-导出更多平台.md](./用户故事-导出更多平台.md) 中的 US-001 ~ US-004，全部通过即视为完成。

**关键测试用例：**

1. **Markdown 导出 — 默认参数**：完成任务后点导出 → Markdown → 选目录 → 成功 toast，目标目录存在同名 .md，内容与源文件一致（含 `[[wiki-link]]`）。
2. **Markdown 导出 — 去除 wiki-link**：勾选"去除 Obsidian 语法"选项 → 目标文件 `[[张三]]` 转为 `张三`，`[[张三|老张]]` 转为 `老张`。
3. **Markdown 导出 — 文件名冲突**：目标目录已存在同名文件 → 新文件名追加 `_YYYYMMDDHHmmss` 后缀，不报错。
4. **Logseq 导出 — 未配置**：未配置 logseq_dir → 菜单项禁用 + 悬停提示；强制调用 IPC 返回 `{ success: false, error: '未配置 Logseq 目录...' }`。
5. **Logseq 导出 — 已配置**：配置后点击 → 复制到 Logseq 目录，保留原 frontmatter 和 `[[wiki-link]]`。
6. **Notion 测试连接 — 成功**：正确 token + database_id → 返回 `{ success: true, databaseTitle: '播客笔记' }`。
7. **Notion 测试连接 — 失败**：错误 token → 返回 401 错误。
8. **Notion 上传 — 首次**：上传成功返回 pageUrl，点击能在浏览器打开。
9. **Notion 上传 — 重复检测**：同名页面已存在 → 返回 `{ success: false, error: 'Notion database 中已存在同名页面' }`。
10. **Notion 上传 — properties 映射**：database 含 title/show/date/category/tags 列 → 上传后 properties 正确填充。
11. **Notion 上传 — blocks 转换**：标题转 heading_X，列表转 list_item，引用转 quote，分隔线转 divider。
12. **错误处理 — 任务不存在**：传不存在的 taskId → `{ success: false, error: '任务不存在' }`。
13. **错误处理 — 源文件被删**：notePath 文件已被删除 → 友好错误。
14. **错误处理 — 目标目录不可写**：选择只读目录 → 友好错误。
15. **导出中防重复点击**：导出中按钮 disabled。

---

## 10. 风险与降级

| 风险 | 概率 | 应对 |
|------|------|------|
| Notion API 改版 | 低 | 锁定 `Notion-Version: 2022-06-28`，API 变更需手动升级 |
| Notion 100 blocks 限制 | 中 | 笔记超长截断 + 日志警告，引导用户手动拆分；下版本实现分批追加 |
| Notion database schema 不匹配 | 中 | 上传前 GET schema 校验，frontmatter 字段在 database 不存在时跳过（不报错） |
| Notion token 泄露 | 中 | 不写入日志，不返回前端；token 在 config 文件中明文存储（与 obsidian_dir 同安全等级，依赖 .gitignore） |
| Logseq 与 Obsidian frontmatter 不兼容 | 低 | Logseq 完全兼容 YAML frontmatter + wiki-link，无需转换 |
| 网络/超时 | 中 | 30s 超时 + 友好错误提示 |
| 用户误删 notePath 文件 | 低 | 上传前 access 校验 |
| 重复导出同一笔记 | 中 | Notion 做 query 重复检测；Markdown/Logseq 自动追加时间戳后缀 |

---

## 11. 发布计划

**版本：** v1.13.0（minor，新功能）

**里程碑：**

1. US-001 Markdown 导出后端 + IPC — 0.5 天
2. US-004 导出按钮 UI + 设置面板 — 1 天
3. US-002 Logseq 导出（复用 US-001） — 0.5 天
4. US-003 Notion 集成（converter + IPC + 错误处理） — 1.5 天
5. 联调 + 测试 + 文档 + 提交 — 0.5 天

**预计：** 4 天完成。

---

## 12. 不在本次范围

- 批量导出（批量处理面板加导出列）
- 自动导出（笔记生成后自动推送）
- 飞书云文档导出（与 IM 通知不同链路，需 scope 升级）
- 印象笔记 / OneNote / Bear 导出
- Notion 页面更新（覆盖已有页面，需 PATCH children 复杂）
- Notion 嵌套列表 / 表格 / 图片转换
- 导出历史记录
- 导出进度条（笔记普遍 <100 blocks，spinner 够用）
- 跨多库导出（一次导出到多个 Notion workspace）
