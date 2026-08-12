import * as path from 'path'
import * as fs from 'fs'
import type { AIProviderId } from '../shared/types'
import { buildApiUrl } from './ai-client'

export interface PeopleEntity {
  name: string
  role?: string
  opinions?: string[]
  timeline?: string
  quotes?: string[]
}

export interface ProjectEntity {
  name: string
  summary?: string
  timeline?: string
  links?: string
  achievements?: string[]
}

export interface ConceptEntity {
  name: string
  explanation?: string
  related?: string[]
}

export interface TermEntity {
  name: string
  cardType?: string
  contextExplanation?: string
  supplementary?: string
  related?: string[]
}

export interface EntityResult {
  people: PeopleEntity[]
  projects: ProjectEntity[]
  concepts: ConceptEntity[]
  terms: TermEntity[]
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

function parseEntitySection(text: string, tag: string): Map<string, string>[] {
  const re = new RegExp(`---CARD-${tag}---\\n([\\s\\S]*?)\\n---CARD-${tag}-END---`, 'g')
  const matches = [...text.matchAll(re)]
  if (matches.length === 0) return []

  const results: Map<string, string>[] = []
  for (const match of matches) {
    const raw = match[1].trim()
    if (raw) {
      results.push(splitFieldValue(raw))
    }
  }
  return results
}

export function parseEntityBlocks(markdown: string): EntityResult {
  const people = parseEntitySection(markdown, 'PEOPLE')
  const projects = parseEntitySection(markdown, 'PROJECT')
  const concepts = parseEntitySection(markdown, 'CONCEPT')
  const terms = parseEntitySection(markdown, 'TERM')
  const parsed: EntityResult = {
    people: people.map(m => ({
      name: m.get('姓名') || '',
      role: m.get('角色'),
      opinions: m.get('核心观点')?.split('\n').filter(Boolean),
      timeline: m.get('时间轴'),
      quotes: m.get('金句')?.split('\n').filter(Boolean),
    })),
    projects: projects.map(m => ({
      name: m.get('项目名称') || '',
      summary: m.get('核心定位'),
      timeline: m.get('提及时间点'),
      links: m.get('相关链接'),
      achievements: m.get('关键成果')?.split('\n').filter(Boolean),
    })),
    concepts: concepts.map(m => ({
      name: m.get('概念名称') || '',
      explanation: m.get('核心解释'),
      related: m
        .get('相关概念')
        ?.split(/[,，]/)
        .map(s => s.trim().replace(/^\[\[|]]$/g, ''))
        .filter(Boolean),
    })),
    terms: terms.map(m => ({
      name: m.get('术语名称') || '',
      cardType: m.get('卡片类型'),
      contextExplanation: m.get('上下文解释'),
      supplementary: m.get('补充说明'),
      related: m
        .get('相关术语')
        ?.split(/[,，]/)
        .map(s => s.trim().replace(/^\[\[|]]$/g, ''))
        .filter(Boolean),
    })),
  }
  return filterNonNotablePeople(parsed)
}

const NON_NOTABLE_ROLE_PATTERNS = [
  /^自媒体$/,
  /^博主$/,
  /^UP主$/,
  /^网红$/,
  /^播客主持人$/,
  /^主持人$/,
  /^嘉宾$/,
  /^嘉宾\s*$/,
  /^普通/,
  /爱好者$/,
  /^主播$/,
  /^内容创作者$/,
]

const NON_NOTABLE_NAME_PATTERNS = [/妈妈$/, /爸爸$/, /君$/, /学长$/, /学姐$/, /老师$/]

function isNotablePerson(person: PeopleEntity): boolean {
  const name = person.name || ''
  const role = (person.role || '').trim()

  if (!role) return false

  for (const pattern of NON_NOTABLE_ROLE_PATTERNS) {
    if (pattern.test(role)) return false
  }

  for (const pattern of NON_NOTABLE_NAME_PATTERNS) {
    if (pattern.test(name)) return false
  }

  return true
}

export function filterNonNotablePeople(entities: EntityResult): EntityResult {
  const filtered = entities.people.filter(isNotablePerson)
  const removed = entities.people.length - filtered.length
  if (removed > 0) {
    const removedNames = entities.people
      .filter(p => !isNotablePerson(p))
      .map(p => p.name)
      .join(', ')
    console.log(`🃏 人物卡片过滤: 移除 ${removed} 个不符合知名度门槛的人物 (${removedNames})`)
  }
  return { ...entities, people: filtered }
}

/**
 * 获取被过滤掉的非知名人物名单（主持人/嘉宾/博主等）
 * 用于将正文中这些名字的 [[wiki-link]] 转为纯文本，避免悬挂链接
 */
export function getNonNotablePeopleNames(entities: EntityResult): string[] {
  return entities.people.filter(p => !isNotablePerson(p)).map(p => p.name).filter(Boolean)
}

export function sanitizeName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/\.+$/, '')
      .trim()
      .slice(0, 100) || '未命名'
  )
}

/**
 * 计算从 fromDir 到 toFile 的相对路径（POSIX 风格，用 / 分隔）
 * 用于生成标准 Markdown 链接 [name](relative/path.md)
 */
export function relativePath(fromDir: string, toFile: string): string {
  const rel = path.relative(fromDir, toFile).replace(/\\/g, '/')
  return rel
}

/**
 * 将 [[wiki-link]] 转换为标准 Markdown 链接 [wiki-link](relative/path.md)
 * @param content 笔记内容
 * @param noteDir 笔记所在目录（用于计算相对路径）
 * @param entityMap 实体名 → 实体文件绝对路径的映射
 */
export function convertWikiLinks(
  content: string,
  noteDir: string,
  entityMap: Map<string, string>,
): string {
  return content.replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, (_match, name: string) => {
    const trimmed = name.trim()
    const absPath = entityMap.get(trimmed)
    if (!absPath) return `[${trimmed}](${trimmed}.md)` // fallback
    const rel = relativePath(noteDir, absPath)
    return `[${trimmed}](${rel})`
  })
}

export interface WriteEntityOptions {
  entities: EntityResult
  obsidianDir: string
  podcastFilename: string
  /** 播客笔记相对于 obsidianDir 的路径（含分类子目录），如 "科技/某播客.md" */
  podcastRelativePath?: string
  podcastTitle?: string
  podcastDate?: string
  podcastEpisode?: string
  apiKey?: string
  providerConfig?: { baseUrl: string; apiKey: string; model: string } | null
  providerId?: AIProviderId
  onProgress?: (msg: string) => void
}

export interface WriteEntityResult {
  peopleWritten: number
  projectsWritten: number
  conceptsWritten: number
  termsWritten: number
  termToConcept: number
  conceptSearched: number
}

function loadTemplate(name: string): string {
  const paths = [
    ...(process.resourcesPath
      ? [path.join(process.resourcesPath, 'obsidian_templates', name)]
      : []),
    path.join(__dirname, '..', '..', 'obsidian_templates', name),
    path.join(process.cwd(), 'obsidian_templates', name),
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  }
  return getFallbackTemplate(name)
}

function fillTemplate(tmpl: string, fields: Record<string, string>): string {
  let result = tmpl
  for (const [key, val] of Object.entries(fields)) {
    const display = val || '（暂无详细信息）'
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), display)
  }
  return result
}

/** 带超时的 fetch，防止网络不通导致长时间挂起 */
async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 8000, ...fetchOpts } = opts
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  // 合并外部 signal
  if (fetchOpts.signal) {
    fetchOpts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    return await fetch(url, { ...fetchOpts, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchConceptDefinition(
  name: string,
  providerConfig?: { baseUrl: string; apiKey: string; model: string } | null,
  providerId?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  // 包装：返回 null 的源改为 throw，让 Promise.any 跳过它继续等
  const race = (fn: () => Promise<string | null>): Promise<string> =>
    fn().then(r => {
      if (r) return r
      throw new Error('no result')
    })

  // 所有数据源并行竞速，任一成功立即返回
  const sources: Promise<string>[] = [
    // 中文维基百科
    race(async () => {
      const url = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${encodeURIComponent(name)}&origin=*`
      const resp = await fetchWithTimeout(url, { signal, timeoutMs: 8000 })
      if (!resp.ok) return null
      const data = (await resp.json()) as {
        query?: { pages?: Record<string, { extract?: string }> }
      }
      const pages = data?.query?.pages
      if (!pages) return null
      const page = Object.values(pages)[0]
      if (page?.extract && !page.extract.includes('may refer to')) return page.extract.slice(0, 600)
      return null
    }),
    // 英文维基百科
    race(async () => {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${encodeURIComponent(name)}&origin=*`
      const resp = await fetchWithTimeout(url, { signal, timeoutMs: 8000 })
      if (!resp.ok) return null
      const data = (await resp.json()) as {
        query?: { pages?: Record<string, { extract?: string }> }
      }
      const pages = data?.query?.pages
      if (!pages) return null
      const page = Object.values(pages)[0]
      if (page?.extract && !page.extract.includes('may refer to')) return page.extract.slice(0, 600)
      return null
    }),
    // AI 解释
    ...(providerConfig
      ? [
          race(async () => {
            const resp = await fetchWithTimeout(
              buildApiUrl(providerConfig.baseUrl, (providerId || 'deepseek') as AIProviderId),
              {
                method: 'POST',
                signal,
                timeoutMs: 15000,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${providerConfig.apiKey}`,
                },
                body: JSON.stringify({
                  model: providerConfig.model,
                  messages: [
                    {
                      role: 'user',
                      content: `请用一段话（不超过200字）简洁解释什么是"${name}"。如果是中文概念用中文回答，如果是英文概念用中文解释。只输出解释内容，不要加任何前缀如"${name}是"。`,
                    },
                  ],
                  temperature: 0.3,
                  max_tokens: 300,
                }),
              },
            )
            if (!resp.ok) return null
            const result = (await resp.json()) as {
              choices?: Array<{ message?: { content?: string } }>
            }
            return result.choices?.[0]?.message?.content?.trim() || null
          }),
        ]
      : []),
  ]

  try {
    // Promise.any: 第一个返回非 null 结果的成功；全部失败/返回 null 则返回 null
    return await Promise.any(sources)
  } catch {
    return null
  }
}

function hasRealContext(term: TermEntity): boolean {
  const ctx = (term.contextExplanation || '').trim()
  if (!ctx) return false
  const placeholders = [
    'AI 未自动生成卡片',
    '已由程序补全',
    '请根据笔记内容手动补充',
    '暂无上下文解释',
    '请手动补充',
  ]
  for (const ph of placeholders) {
    if (ctx.includes(ph)) return false
  }
  return true
}

export async function writeEntityNotes(
  options: WriteEntityOptions,
  signal?: AbortSignal,
): Promise<WriteEntityResult> {
  const { entities, obsidianDir, podcastFilename, podcastTitle, podcastDate, podcastEpisode } =
    options
  const today = new Date().toISOString().split('T')[0]
  const result: WriteEntityResult = {
    peopleWritten: 0,
    projectsWritten: 0,
    conceptsWritten: 0,
    termsWritten: 0,
    termToConcept: 0,
    conceptSearched: 0,
  }

  // 确保 Obsidian 根目录存在
  if (!obsidianDir || !obsidianDir.trim()) {
    console.log('⚠ obsidianDir 为空，跳过实体卡片写入')
    return result
  }
  const baseDir = obsidianDir.trim()
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  // 计算播客笔记的绝对路径（用于生成标准 Markdown 链接）
  const podcastRelPath = options.podcastRelativePath || podcastFilename
  const podcastAbsPath = path.join(baseDir, podcastRelPath)
  const podcastNameNoExt = podcastFilename.replace(/\.md$/i, '')

  for (const person of entities.people) {
    if (!person.name) continue
    const dir = path.join(baseDir, '人物')
    const filePath = path.join(dir, `${sanitizeName(person.name)}.md`)
    const sourceRelPath = relativePath(dir, podcastAbsPath)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastNameNoExt, sourceRelPath)
    } else {
      const tmpl = loadTemplate('People_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: person.name,
        role: person.role || '',
        opinions: (person.opinions || []).map(o => `- ${o}`).join('\n'),
        timeline: person.timeline || '',
        quotes: (person.quotes || []).map(q => `> ${q}`).join('\n'),
        source: `[${podcastNameNoExt}](${sourceRelPath})`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      result.peopleWritten++
    }
  }

  for (const project of entities.projects) {
    if (!project.name) continue
    const dir = path.join(baseDir, '项目')
    const filePath = path.join(dir, `${sanitizeName(project.name)}.md`)
    const sourceRelPath = relativePath(dir, podcastAbsPath)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastNameNoExt, sourceRelPath)
    } else {
      const tmpl = loadTemplate('Project_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: project.name,
        summary: project.summary || '',
        timeline: project.timeline || '',
        links: project.links || '',
        achievements: (project.achievements || []).map(a => `- ${a}`).join('\n'),
        source: `[${podcastNameNoExt}](${sourceRelPath})`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      result.projectsWritten++
    }
  }

  // ===== 并行预获取所有需要查询的定义 =====
  // 收集需要获取定义的概念
  const conceptsToFetch = new Map<string, number>() // name -> index in concepts array
  for (let i = 0; i < entities.concepts.length; i++) {
    const c = entities.concepts[i]
    if (!c.name || c.explanation) continue
    const filePath = path.join(baseDir, '概念', `${sanitizeName(c.name)}.md`)
    if (fs.existsSync(filePath)) continue
    conceptsToFetch.set(c.name, i)
  }

  // 收集需要获取定义的术语（无真实上下文的，将转为概念卡片）
  const termsToFetch = new Map<string, number>() // name -> index in terms array
  for (let i = 0; i < entities.terms.length; i++) {
    const t = entities.terms[i]
    if (!t.name || hasRealContext(t)) continue
    const filePath = path.join(baseDir, '概念', `${sanitizeName(t.name)}.md`)
    if (fs.existsSync(filePath)) continue
    termsToFetch.set(t.name, i)
  }

  // 合并所有需要查询的名称（去重）
  const allNamesToFetch = new Set<string>([...conceptsToFetch.keys(), ...termsToFetch.keys()])
  const namesArray = [...allNamesToFetch]
  const definitionMap = new Map<string, string | null>() // name -> definition

  if (namesArray.length > 0) {
    options.onProgress?.(`  🔍 正在并行查找 ${namesArray.length} 个实体定义（全局超时 30 秒）...`)

    const GLOBAL_TIMEOUT_MS = 30_000
    const globalTimeoutPromise = new Promise<'timeout'>(resolve =>
      setTimeout(() => resolve('timeout'), GLOBAL_TIMEOUT_MS),
    )

    // 每个 fetch 完成后立即写入 definitionMap，超时后也能读取已完成的结果
    const fetchAllPromise = Promise.allSettled(
      namesArray.map(name =>
        fetchConceptDefinition(name, options.providerConfig, options.providerId, signal).then(
          def => {
            definitionMap.set(name, def)
            return def
          },
        ),
      ),
    )

    const raceResult = await Promise.race([fetchAllPromise, globalTimeoutPromise])

    if (raceResult === 'timeout') {
      const fetched = [...definitionMap.values()].filter(Boolean).length
      options.onProgress?.(
        `  ⏱ 全局超时（${GLOBAL_TIMEOUT_MS / 1000}s），${fetched}/${namesArray.length} 个已获取`,
      )
    } else {
      const fetched = [...definitionMap.values()].filter(Boolean).length
      options.onProgress?.(`  ✅ 定义查找完成：${fetched}/${namesArray.length} 成功`)
    }
  }

  // ===== 写入概念卡片 =====
  for (const concept of entities.concepts) {
    if (!concept.name) continue
    const dir = path.join(baseDir, '概念')
    const filePath = path.join(dir, `${sanitizeName(concept.name)}.md`)
    const sourceRelPath = relativePath(dir, podcastAbsPath)
    if (fs.existsSync(filePath)) {
      appendSourceLink(filePath, podcastNameNoExt, sourceRelPath)
    } else {
      // 使用预获取的定义，或原始解释，或空
      let explanation = concept.explanation || ''
      if (!explanation && definitionMap.has(concept.name)) {
        explanation = definitionMap.get(concept.name) || ''
      }
      const tmpl = loadTemplate('Concept_Template.md')
      const content = fillTemplate(tmpl, {
        date: today,
        name: concept.name,
        explanation,
        related: (concept.related || []).map(r => `- [${r}](${sanitizeName(r)}.md)`).join('\n'),
        source: `[${podcastNameNoExt}](${sourceRelPath})`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      result.conceptsWritten++
    }
  }

  // ===== 写入术语卡片 =====
  for (const term of entities.terms) {
    if (!term.name) continue

    if (hasRealContext(term)) {
      const dir = path.join(baseDir, '术语')
      const filePath = path.join(dir, `${sanitizeName(term.name)}.md`)
      const sourceRelPath = relativePath(dir, podcastAbsPath)
      if (fs.existsSync(filePath)) {
        appendSourceLink(filePath, podcastNameNoExt, sourceRelPath)
      } else {
        const tmpl = loadTemplate('Term_Template.md')
        const content = fillTemplate(tmpl, {
          date: today,
          name: term.name,
          cardType: term.cardType || '',
          contextExplanation: term.contextExplanation || '',
          supplementary: term.supplementary || '',
          related: (term.related || []).map(r => `- [${r}](${sanitizeName(r)}.md)`).join('\n'),
          source: `[${podcastNameNoExt}](${sourceRelPath})`,
        })
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        result.termsWritten++
      }
    } else {
      result.termToConcept++

      // 使用预获取的定义
      const definition = definitionMap.get(term.name) || null
      if (definition) result.conceptSearched++

      const dir = path.join(baseDir, '概念')
      const filePath = path.join(dir, `${sanitizeName(term.name)}.md`)
      const sourceRelPath = relativePath(dir, podcastAbsPath)
      if (fs.existsSync(filePath)) {
        appendSourceLink(filePath, podcastNameNoExt, sourceRelPath)
      } else {
        const tmpl = loadTemplate('Concept_Template.md')
        const explanation =
          definition ||
          `（暂未从网络中获取到"${term.name}"的定义，请手动搜索补充。本概念在播客中被提及但AI未生成完整上下文解释。）`
        const content = fillTemplate(tmpl, {
          date: today,
          name: term.name,
          explanation,
          related: (term.related || []).map(r => `- [${r}](${sanitizeName(r)}.md)`).join('\n'),
          source: `[${podcastNameNoExt}](${sourceRelPath})`,
        })
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        result.conceptsWritten++
      }
    }
  }

  // ===== 更新"近期提及"段落 =====
  if (podcastTitle) {
    const allEntities: { name: string; dir: string }[] = [
      ...entities.people.map(e => ({ name: e.name, dir: '人物' })),
      ...entities.projects.map(e => ({ name: e.name, dir: '项目' })),
      ...entities.concepts.map(e => ({ name: e.name, dir: '概念' })),
      ...entities.terms.map(e => ({ name: e.name, dir: hasRealContext(e) ? '术语' : '概念' })),
    ]
    for (const { name, dir } of allEntities) {
      if (!name) continue
      const filePath = path.join(baseDir, dir, `${sanitizeName(name)}.md`)
      if (fs.existsSync(filePath)) {
        const entityDir = path.join(baseDir, dir)
        const sourceRelPath = relativePath(entityDir, podcastAbsPath)
        updateRecentMentions(filePath, podcastNameNoExt, sourceRelPath, podcastDate, podcastEpisode)
      }
    }
  }

  return result
}

function appendSourceLink(filePath: string, linkName: string, relPath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8')
  const link = `[${linkName}](${relPath})`
  if (content.includes(link)) return
  fs.appendFileSync(filePath, `\n- ${link}\n`, 'utf-8')
}

function updateRecentMentions(
  filePath: string,
  linkName: string,
  relPath: string,
  podcastDate?: string,
  podcastEpisode?: string,
): void {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  const datePart = podcastDate || ''
  const episodePart = podcastEpisode && podcastEpisode !== '单集' ? ` ${podcastEpisode}` : ''
  const meta = `(${datePart}${episodePart})`.replace(/\(\s*\)/, '').trim()
  const link = `[${linkName}](${relPath})`
  const newEntry = meta ? `- ${link} ${meta}` : `- ${link}`

  const sectionRe = /\n# 近期提及\n([\s\S]*?)(?=\n# |\n---\s*$|$)/
  const match = content.match(sectionRe)

  if (match) {
    const existingLines = match[1]
      .trim()
      .split('\n')
      .filter(l => l.startsWith('- '))
    const filtered = existingLines.filter(l => !l.includes(link))
    const updated = [newEntry, ...filtered].slice(0, 3)
    const newSection = `\n# 近期提及\n${updated.join('\n')}\n`
    content = content.replace(sectionRe, newSection)
  } else {
    content += `\n# 近期提及\n${newEntry}\n`
  }

  fs.writeFileSync(filePath, content, 'utf-8')
}

function getFallbackTemplate(name: string): string {
  if (name === 'People_Template.md') {
    return `---\ntype: people\nname: {{name}}\nrole: {{role}}\ndate: {{date}}\ntags: []\n---\n\n# 人物画像\n{{name}}（{{role}}）\n\n# 核心观点\n{{opinions}}\n\n# 金句\n{{quotes}}\n\n# 时间轴\n{{timeline}}\n\n# 来源内容\n- {{source}}\n`
  }
  if (name === 'Project_Template.md') {
    return `---\ntype: project\nname: {{name}}\ndate: {{date}}\ntags: []\n---\n\n# 项目简介\n{{name}} — {{summary}}\n\n# 关键成果\n{{achievements}}\n\n# 提及时间点\n{{timeline}}\n\n# 相关链接\n{{links}}\n\n# 来源内容\n- {{source}}\n`
  }
  if (name === 'Concept_Template.md') {
    return `---\ntype: concept\nname: {{name}}\ndate: {{date}}\ntags: []\n---\n\n# 概念定义\n{{name}} — {{explanation}}\n\n# 核心解释\n{{explanation}}\n\n# 相关概念\n{{related}}\n\n# 来源内容\n- {{source}}\n`
  }
  if (name === 'Term_Template.md') {
    return `---\ntype: term\nname: {{name}}\ncard_type: {{cardType}}\ndate: {{date}}\ntags: []\n---\n\n# 术语名称\n{{name}}\n\n# 卡片类型\n{{cardType}}\n\n# 上下文解释\n{{contextExplanation}}\n\n# 补充说明\n{{supplementary}}\n\n# 相关术语\n{{related}}\n\n# 来源内容\n- {{source}}\n`
  }
  throw new Error(`Unknown template: ${name}`)
}

export function extractGlossaryTerms(markdown: string): string[] {
  const sectionMatch = markdown.match(/# 术语词典[^\n]*\n[\s\S]*?(?=\n---|\n# [^#]|\n$)/)
  if (!sectionMatch) return []
  const section = sectionMatch[0]
  const terms: string[] = []
  const linkRe = /- \[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(section)) !== null) {
    terms.push(match[1].trim())
  }
  return terms
}

export function fillMissingTermCards(
  markdown: string,
  entities: EntityResult,
): { entities: EntityResult; filled: number } {
  const glossaryTerms = extractGlossaryTerms(markdown)
  if (!glossaryTerms.length) return { entities, filled: 0 }

  const existingNames = new Set(entities.terms.map(t => t.name))
  const missing = glossaryTerms.filter(t => !existingNames.has(t))
  if (!missing.length) return { entities, filled: 0 }

  const filled = missing.map(
    name =>
      ({
        name,
        cardType: '',
        contextExplanation: '',
        supplementary: '',
        related: [],
      }) as TermEntity,
  )

  return {
    entities: { ...entities, terms: [...entities.terms, ...filled] },
    filled: filled.length,
  }
}

/**
 * 提取正文中所有 [[wiki-link]]（不含 CARD 块部分）
 */
export function extractBodyWikiLinks(markdown: string): string[] {
  // 截取 CARD 块之前的部分（即正文）
  const cardStart = markdown.indexOf('---CARD-')
  const body = cardStart >= 0 ? markdown.substring(0, cardStart) : markdown

  const links: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    links.push(match[1].trim())
  }
  return [...new Set(links)]
}

/**
 * 为正文中引用但没有卡片的 wiki-link 自动补上概念卡片，确保每个链接都有落地页
 */
export function fillMissingEntityCards(
  entities: EntityResult,
  bodyLinks: string[],
  skipNames?: string[],
): { entities: EntityResult; filled: number } {
  // 收集所有已有卡片的实体名
  const existingNames = new Set<string>()
  for (const p of entities.people) if (p.name) existingNames.add(p.name)
  for (const p of entities.projects) if (p.name) existingNames.add(p.name)
  for (const c of entities.concepts) if (c.name) existingNames.add(c.name)
  for (const t of entities.terms) if (t.name) existingNames.add(t.name)

  // 跳过名单（如被过滤的非知名人物）不补卡片
  const skipSet = new Set(skipNames || [])

  const missing = bodyLinks.filter(
    name => name && !existingNames.has(name) && !skipSet.has(name),
  )
  if (!missing.length) return { entities, filled: 0 }

  // 为缺卡片的链接创建概念卡片（最通用的实体类型）
  const stubs = missing.map(
    name =>
      ({
        name,
        explanation: '',
        related: [],
      }) as ConceptEntity,
  )

  return {
    entities: { ...entities, concepts: [...entities.concepts, ...stubs] },
    filled: stubs.length,
  }
}
