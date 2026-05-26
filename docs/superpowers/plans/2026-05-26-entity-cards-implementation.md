# 实体卡片自动生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** DeepSeek 一次调用同时产出播客笔记 + 实体卡片数据（人物/项目/概念），后端解析后用模板生成独立 .md 文件存入对应文件夹，并建立双向链接。

**Architecture:** 修改 `AI_PROMPT` 在笔记模板后追加实体块指令；新增 `entity-cards.ts` 做解析/模板填充/写入去重；在 `podcast.ts` 的 `generateNotes` 调用后串联实体处理。

**Tech Stack:** TypeScript, Node fs/path, Node test runner (`node --test`).

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|---|---|---|
| 新增 | `src/main/entity-cards.ts` | 实体块解析、模板填充、写入与去重 |
| 修改 | `src/main/deepseek.ts` | `AI_PROMPT` 末尾追加实体块指令 |
| 修改 | `src/main/podcast.ts` | `generateNotes` 后调用实体处理 |
| 修改 | `electron-builder.yml` | extraResources 增加 `obsidian_templates/` |
| 新增 | `tests/entity-cards.test.mjs` | 解析、模板、去重测试 |

---

## Task 1: 实现实体块解析引擎

**Files:**
- Create: `src/main/entity-cards.ts` (first half)
- Test: `tests/entity-cards.test.mjs` (parse tests)

- [ ] **Step 1: 写测试（解析单元测试）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'

const SRC = 'src/main/entity-cards.ts'

function readSource() { return fs.readFileSync(SRC, 'utf-8') }

test('parseEntityBlocks exists', () => {
  const src = readSource()
  assert.match(src, /export function parseEntityBlocks/)
})

test('parseEntityBlocks extracts people entities', () => {
  const src = readSource()
  assert.match(src, /CARD-PEOPLE/)
  assert.match(src, /姓名/)
})

test('parseEntityBlocks extracts project entities', () => {
  const src = readSource()
  assert.match(src, /CARD-PROJECT/)
  assert.match(src, /项目名称/)
})

test('parseEntityBlocks extracts concept entities', () => {
  const src = readSource()
  assert.match(src, /CARD-CONCEPT/)
  assert.match(src, /概念名称/)
})

test('writeEntityNotes exists', () => {
  const src = readSource()
  assert.match(src, /export function writeEntityNotes/)
})
```

- [ ] **Step 2: 跑测试验证失败**

Run: `node --test tests/entity-cards.test.mjs`
Expected: FAIL — file does not exist

- [ ] **Step 3: 实现 `entity-cards.ts`（解析部分）**

```typescript
import * as path from 'path'
import * as fs from 'fs'

export interface PeopleEntity {
  name: string; role?: string; opinions?: string[]; timeline?: string
}

export interface ProjectEntity {
  name: string; summary?: string; timeline?: string; links?: string
}

export interface ConceptEntity {
  name: string; explanation?: string; related?: string[]
}

export interface EntityResult {
  people: PeopleEntity[]
  projects: ProjectEntity[]
  concepts: ConceptEntity[]
}

function splitFieldValue(block: string): Map<string, string> {
  const map = new Map<string, string>()
  let currentKey = ''
  let currentVal: string[] = []
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^(\S[^：]*?)：(.*)$/)
    if (match) {
      if (currentKey) map.set(currentKey, currentVal.join('\n').trim())
      currentKey = match[1].trim()
      currentVal = [match[2].trim()]
    } else if (currentKey && line.startsWith('  ')) {
      currentVal.push(line.trim())
    }
  }
  if (currentKey) map.set(currentKey, currentVal.join('\n').trim())
  return map
}

function parseEntitySection(text: string, tag: string, splitField: string): Map<string, Map<string, string>>[] {
  const re = new RegExp(`---CARD-${tag}---\\n([\\s\\S]*?)\\n---CARD-${tag}-END---`)
  const m = text.match(re)
  if (!m) return []
  const raw = m[1]
  const segments = raw.split(new RegExp(`(?=^${splitField}：)`, 'm'))
  return segments.filter(Boolean).map(seg => splitFieldValue(seg.trim()))
}

export function parseEntityBlocks(markdown: string): EntityResult {
  const people = parseEntitySection(markdown, 'PEOPLE', '姓名')
  const projects = parseEntitySection(markdown, 'PROJECT', '项目名称')
  const concepts = parseEntitySection(markdown, 'CONCEPT', '概念名称')
  return {
    people: people.map(m => ({ name: m.get('姓名') || '', role: m.get('角色'), opinions: m.get('核心观点')?.split('\n').filter(Boolean), timeline: m.get('时间轴') })),
    projects: projects.map(m => ({ name: m.get('项目名称') || '', summary: m.get('核心定位'), timeline: m.get('提及时间点'), links: m.get('相关链接') })),
    concepts: concepts.map(m => ({ name: m.get('概念名称') || '', explanation: m.get('核心解释'), related: m.get('相关概念')?.split(/[,，]/).map(s => s.trim().replace(/^\[\[|]]$/g, '')).filter(Boolean) })),
  }
}
```

- [ ] **Step 4: 跑测试验证通过**

Run: `node --test tests/entity-cards.test.mjs`
Expected: PASS

---

## Task 2: 实现模板填充 & 写入去重

**Files:**
- Modify: `src/main/entity-cards.ts` (add fill + write functions)
- Test: `tests/entity-cards.test.mjs` (add write tests)

- [ ] **Step 1: 加写入测试（临时目录）**

```js
test('writeEntityNotes creates files in correct directories', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-test-'))
  const entities = {
    people: [{ name: '张三', role: '创业者' }],
    projects: [{ name: 'AI笔记', summary: '工具' }],
    concepts: [],
  }
  writeEntityNotes(entities, tmp, '播客笔记.md')
  assert.ok(fs.existsSync(path.join(tmp, '人物', '张三.md')))
  assert.ok(fs.existsSync(path.join(tmp, '项目', 'AI笔记.md')))
  assert.ok(!fs.existsSync(path.join(tmp, '概念')))
  // 清理
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('writeEntityNotes appends source on duplicate', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-dedup-'))
  fs.mkdirSync(path.join(tmp, '人物'), { recursive: true })
  fs.writeFileSync(path.join(tmp, '人物', '张三.md'), '---\nsource: []\n---\n\n# 来源内容\n')
  const entities = { people: [{ name: '张三' }], projects: [], concepts: [] }
  writeEntityNotes(entities, tmp, '第二期.md')
  const content = fs.readFileSync(path.join(tmp, '人物', '张三.md'), 'utf-8')
  assert.ok(content.includes('第二期'))
  fs.rmSync(tmp, { recursive: true, force: true })
})
```

- [ ] **Step 2: 先在 entity-cards.ts 里添加 `sanitizePathSegment`（复用或内联）**

```typescript
export function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || '未命名'
}
```

- [ ] **Step 3: 实现模板填充与写入**

```typescript
function loadTemplate(name: string): string {
  // 先从 process.resourcesPath 找， fallback 到项目根目录
  const paths = [
    ...(process.resourcesPath ? [path.join(process.resourcesPath, 'obsidian_templates', name)] : []),
    path.join(__dirname, '..', '..', 'obsidian_templates', name),
    path.join(process.cwd(), 'obsidian_templates', name),
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  // 硬编码兜底模板
  return getFallbackTemplate(name)
}

function fillTemplate(tmpl: string, fields: Record<string, string>): string {
  let result = tmpl
  for (const [key, val] of Object.entries(fields)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '')
  }
  return result
}

export interface WriteEntityOptions {
  entities: EntityResult
  obsidianDir: string
  podcastFilename: string
}

export function writeEntityNotes(options: WriteEntityOptions): void {
  const { entities, obsidianDir, podcastFilename } = options
  const today = new Date().toISOString().split('T')[0]

  for (const person of entities.people) {
    if (!person.name) continue
    const dir = path.join(obsidianDir, '人物')
    const filePath = path.join(dir, `${sanitizeName(person.name)}.md`)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastFilename)
    } else {
      const tmpl = loadTemplate('People_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: person.name,
        role: person.role || '',
        opinions: (person.opinions || []).map(o => `- ${o}`).join('\n'),
        timeline: person.timeline || '',
        source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
    }
  }

  for (const project of entities.projects) {
    if (!project.name) continue
    const dir = path.join(obsidianDir, '项目')
    const filePath = path.join(dir, `${sanitizeName(project.name)}.md`)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastFilename)
    } else {
      const tmpl = loadTemplate('Project_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: project.name,
        summary: project.summary || '',
        timeline: project.timeline || '',
        links: project.links || '',
        source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
    }
  }

  for (const concept of entities.concepts) {
    if (!concept.name) continue
    const dir = path.join(obsidianDir, '概念')
    const filePath = path.join(dir, `${sanitizeName(concept.name)}.md`)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastFilename)
    } else {
      const tmpl = loadTemplate('Concept_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: concept.name,
        explanation: concept.explanation || '',
        related: (concept.related || []).map(r => `- [[${r}]]`).join('\n'),
        source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
    }
  }
}

function appendSourceLink(filePath: string, podcastFilename: string): void {
  const content = fs.readFileSync(filePath, 'utf-8')
  const link = `[[${podcastFilename.replace(/\.md$/i, '')}]]`
  if (content.includes(link)) return
  fs.appendFileSync(filePath, `\n- ${link}\n`, 'utf-8')
}
```

- [ ] **Step 4: 加兜底模板函数（在 entity-cards.ts 末尾）**

```typescript
function getFallbackTemplate(name: string): string {
  if (name === 'People_Template.md') {
    return `---\ntype: people\nname: {{name}}\nrole: {{role}}\ndate: {{date}}\ntags: []\n---\n\n# 人物简介\n{{name}}\n\n# 核心观点\n{{opinions}}\n\n# 时间轴\n{{timeline}}\n\n# 来源内容\n- {{source}}\n`
  }
  if (name === 'Project_Template.md') {
    return `---\ntype: project\nname: {{name}}\ndate: {{date}}\ntags: []\n---\n\n# 项目名称\n{{name}}\n\n# 核心定位\n{{summary}}\n\n# 提及时间点\n{{timeline}}\n\n# 相关链接\n{{links}}\n\n# 来源内容\n- {{source}}\n`
  }
  if (name === 'Concept_Template.md') {
    return `---\ntype: concept\nname: {{name}}\ndate: {{date}}\ntags: []\n---\n\n# 概念定义\n{{name}}\n\n# 核心解释\n{{explanation}}\n\n# 相关概念\n{{related}}\n\n# 来源内容\n- {{source}}\n`
  }
  throw new Error(`Unknown template: ${name}`)
}
```

- [ ] **Step 5: 跑测试验证通过**

Run: `node --test tests/entity-cards.test.mjs`
Expected: PASS

---

## Task 3: 修改 AI_PROMPT 追加实体指令

**Files:**
- Modify: `src/main/deepseek.ts`

- [ ] **Step 1: 在 `AI_PROMPT` 末尾 `请处理以下逐字稿：` 之前插入实体块指令**

```typescript
另外，请检测本期播客中提到的所有重要实体，按以下格式输出。
注意：
- 如果某类实体没有提及，不要输出对应的 ---CARD-*--- 块
- 如果某类实体有多个，每段之间用空行隔开
- 字段值如果跨多行，保持缩进对齐
- 嘉宾已在 guest frontmatter 中列出，无需再输出人物卡片

---CARD-PEOPLE---
姓名：张三
角色：AI 创业者 / 学者 / 行业专家
核心观点：
  他认为AI时代最重要的能力是沟通能力。
  他不觉得中年人会被AI取代。
时间轴：12:30-18:45 讨论AI对工作影响
---CARD-PEOPLE-END---

---CARD-PROJECT---
项目名称：小宇宙
核心定位：中文播客平台
提及时间点：05:00-08:30, 22:10-25:00
相关链接：https://xiaoyuzhoufm.com
---CARD-PROJECT-END---

---CARD-CONCEPT---
概念名称：向量数据库
核心解释：一种能理解数据语义关系的数据库，而非仅靠关键词匹配
相关概念：[[传统数据库]], [[AI Agent]], [[RAG]]
---CARD-CONCEPT-END---
```

实际做法：在 `AI_PROMPT` 的 `请处理以下逐字稿：` 上方插入这段指令。

- [ ] **Step 2: 同时在播客笔记模板末尾增加关联章节**

在现有模板的 `# 金句摘录` 之后、`请处理以下逐字稿：` 之前插入：

```markdown
# 关联人物
- [[人物名]]

# 关联项目
- [[项目名]]

# 关联概念
- [[概念名]]
```

由 AI 自行决定是否输出这些章节（未检测到时不输出）。

---

## Task 4: 在 podcast.ts 中串联实体处理

**Files:**
- Modify: `src/main/podcast.ts`

- [ ] **Step 1: 在 `generateNotes` 返回后、写入文件前插入实体处理**

```typescript
// 在 notes.content 生成后：
const entities = parseEntityBlocks(notes.content)
if (entities.people.length || entities.projects.length || entities.concepts.length) {
  writeEntityNotes({ entities, obsidianDir: obsDir, podcastFilename: `${filename}.md` })
}
```

注意 `obsDir` 已经定义为 `obsidianDir` 变量。

---

## Task 5: 配置 electron-builder 打包模板

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: 添加 `obsidian_templates/` 到 extraResources**

```yaml
extraResources:
  - from: podcast_config.json
    to: podcast_config.json
  - from: obsidian_templates
    to: obsidian_templates
```

---

## Task 6: 构建 + 全量测试 + 部署

- [ ] **Step 1: 运行全量测试**

Run: `node --test`
Expected: All pass (包括新加的 entity-cards 测试)

- [ ] **Step 2: 构建**

Run: `npm run build:test`
Expected: Build succeeds

- [ ] **Step 3: 部署**

Run: `npm run deploy:test`
Expected: Deploy overwrites dist-exe/win-unpacked
