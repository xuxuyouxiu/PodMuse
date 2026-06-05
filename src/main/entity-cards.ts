import * as path from 'path'
import * as fs from 'fs'
import type { AIProviderId } from '../shared/types'
import { buildApiUrl } from './ai-client'

export interface PeopleEntity {
  name: string; role?: string; opinions?: string[]; timeline?: string; quotes?: string[]
}

export interface ProjectEntity {
  name: string; summary?: string; timeline?: string; links?: string; achievements?: string[]
}

export interface ConceptEntity {
  name: string; explanation?: string; related?: string[]
}

export interface TermEntity {
  name: string; cardType?: string; contextExplanation?: string; supplementary?: string; related?: string[]
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
    people: people.map(m => ({ name: m.get('姓名') || '', role: m.get('角色'), opinions: m.get('核心观点')?.split('\n').filter(Boolean), timeline: m.get('时间轴'), quotes: m.get('金句')?.split('\n').filter(Boolean) })),
    projects: projects.map(m => ({ name: m.get('项目名称') || '', summary: m.get('核心定位'), timeline: m.get('提及时间点'), links: m.get('相关链接'), achievements: m.get('关键成果')?.split('\n').filter(Boolean) })),
    concepts: concepts.map(m => ({ name: m.get('概念名称') || '', explanation: m.get('核心解释'), related: m.get('相关概念')?.split(/[,，]/).map(s => s.trim().replace(/^\[\[|]]$/g, '')).filter(Boolean) })),
    terms: terms.map(m => ({ name: m.get('术语名称') || '', cardType: m.get('卡片类型'), contextExplanation: m.get('上下文解释'), supplementary: m.get('补充说明'), related: m.get('相关术语')?.split(/[,，]/).map(s => s.trim().replace(/^\[\[|]]$/g, '')).filter(Boolean) })),
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

const NON_NOTABLE_NAME_PATTERNS = [
  /妈妈$/,
  /爸爸$/,
  /君$/,
  /学长$/,
  /学姐$/,
  /老师$/,
]

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
    const removedNames = entities.people.filter(p => !isNotablePerson(p)).map(p => p.name).join(', ')
    console.log(`🃏 人物卡片过滤: 移除 ${removed} 个不符合知名度门槛的人物 (${removedNames})`)
  }
  return { ...entities, people: filtered }
}

export function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 100) || '未命名'
}

export interface WriteEntityOptions {
  entities: EntityResult
  obsidianDir: string
  podcastFilename: string
  apiKey?: string
  contentType?: 'news' | 'article' | 'tutorial' | 'default'
  providerConfig?: { baseUrl: string; apiKey: string; model: string } | null
  providerId?: AIProviderId
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
    ...(process.resourcesPath ? [path.join(process.resourcesPath, 'obsidian_templates', name)] : []),
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
    const display = val || '（本期未提及）'
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), display)
  }
  return result
}

async function fetchConceptDefinition(name: string, providerConfig?: { baseUrl: string; apiKey: string; model: string } | null, providerId?: string, signal?: AbortSignal): Promise<string | null> {
  const sources = [
    async () => {
      const url = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${encodeURIComponent(name)}&origin=*`
      const resp = await fetch(url, { signal })
      if (!resp.ok) return null
      const data = await resp.json() as { query?: { pages?: Record<string, { extract?: string }> } }
      const pages = data?.query?.pages
      if (!pages) return null
      const page = Object.values(pages)[0]
      if (page?.extract && !page.extract.includes('may refer to')) return page.extract.slice(0, 600)
      return null
    },
    async () => {
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=${encodeURIComponent(name)}&origin=*`
      const resp = await fetch(url, { signal })
      if (!resp.ok) return null
      const data = await resp.json() as { query?: { pages?: Record<string, { extract?: string }> } }
      const pages = data?.query?.pages
      if (!pages) return null
      const page = Object.values(pages)[0]
      if (page?.extract && !page.extract.includes('may refer to')) return page.extract.slice(0, 600)
      return null
    },
    providerConfig ? async () => {
      const resp = await fetch(buildApiUrl(providerConfig.baseUrl, (providerId || 'deepseek') as AIProviderId), {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${providerConfig.apiKey}` },
        body: JSON.stringify({
          model: providerConfig.model,
          messages: [
            { role: 'user', content: `请用一段话（不超过200字）简洁解释什么是"${name}"。如果是中文概念用中文回答，如果是英文概念用中文解释。只输出解释内容，不要加任何前缀如"${name}是"。` }
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
      })
      if (!resp.ok) return null
      const result = await resp.json() as { choices?: Array<{ message?: { content?: string } }> }
      return result.choices?.[0]?.message?.content?.trim() || null
    } : null,
  ]

  for (const source of sources) {
    if (!source) continue
    try {
      const result = await source()
      if (result) return result
    } catch {
      continue
    }
  }

  return null
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

export async function writeEntityNotes(options: WriteEntityOptions, signal?: AbortSignal): Promise<WriteEntityResult> {
  const { entities, obsidianDir, podcastFilename } = options
  const today = new Date().toISOString().split('T')[0]
  const result: WriteEntityResult = {
    peopleWritten: 0, projectsWritten: 0, conceptsWritten: 0,
    termsWritten: 0, termToConcept: 0, conceptSearched: 0,
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

  for (const person of entities.people) {
    if (!person.name) continue
    const dir = path.join(baseDir, '人物')
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
        quotes: (person.quotes || []).map(q => `> ${q}`).join('\n'),
        source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
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
        achievements: (project.achievements || []).map(a => `- ${a}`).join('\n'),
        source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
      })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      result.projectsWritten++
    }
  }

  for (const concept of entities.concepts) {
    if (!concept.name) continue
    const dir = path.join(baseDir, '概念')
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
      result.conceptsWritten++
    }
  }

  for (const term of entities.terms) {
    if (!term.name) continue

    if (hasRealContext(term)) {
      const dir = path.join(baseDir, '术语')
      const filePath = path.join(dir, `${sanitizeName(term.name)}.md`)
      if (fs.existsSync(filePath)) {
        appendSourceLink(filePath, podcastFilename)
      } else {
        const tmpl = loadTemplate('Term_Template.md')
        const content = fillTemplate(tmpl, {
          date: today,
          name: term.name,
          cardType: term.cardType || '',
          contextExplanation: term.contextExplanation || '',
          supplementary: term.supplementary || '',
          related: (term.related || []).map(r => `- [[${r}]]`).join('\n'),
          source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
        })
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        result.termsWritten++
      }
    } else {
      result.termToConcept++

      let definition: string | null = null
      try {
        definition = await fetchConceptDefinition(term.name, options.providerConfig, options.providerId, signal)
        if (definition) result.conceptSearched++
      } catch {
        definition = null
      }

      const dir = path.join(baseDir, '概念')
      const filePath = path.join(dir, `${sanitizeName(term.name)}.md`)
      if (fs.existsSync(filePath)) {
        appendSourceLink(filePath, podcastFilename)
      } else {
        const tmpl = loadTemplate('Concept_Template.md')
        const explanation = definition
          || `（暂未从网络中获取到"${term.name}"的定义，请手动搜索补充。本概念在播客中被提及但AI未生成完整上下文解释。）`
        const content = fillTemplate(tmpl, {
          date: today,
          name: term.name,
          explanation,
          related: (term.related || []).map(r => `- [[${r}]]`).join('\n'),
          source: `[[${podcastFilename.replace(/\.md$/i, '')}]]`,
        })
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        result.conceptsWritten++
      }
    }
  }

  return result
}

function appendSourceLink(filePath: string, podcastFilename: string): void {
  const content = fs.readFileSync(filePath, 'utf-8')
  const link = `[[${podcastFilename.replace(/\.md$/i, '')}]]`
  if (content.includes(link)) return
  fs.appendFileSync(filePath, `\n- ${link}\n`, 'utf-8')
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

export function fillMissingTermCards(markdown: string, entities: EntityResult): { entities: EntityResult; filled: number } {
  const glossaryTerms = extractGlossaryTerms(markdown)
  if (!glossaryTerms.length) return { entities, filled: 0 }

  const existingNames = new Set(entities.terms.map(t => t.name))
  const missing = glossaryTerms.filter(t => !existingNames.has(t))
  if (!missing.length) return { entities, filled: 0 }

  const filled = missing.map(name => ({
    name,
    cardType: '',
    contextExplanation: '',
    supplementary: '',
    related: [],
  } as TermEntity))

  return {
    entities: { ...entities, terms: [...entities.terms, ...filled] },
    filled: filled.length,
  }
}
