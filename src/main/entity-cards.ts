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

export function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || '未命名'
}

export interface WriteEntityOptions {
  entities: EntityResult
  obsidianDir: string
  podcastFilename: string
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
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '')
  }
  return result
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
