/**
 * Notion 导出：markdown + frontmatter 转换为 Notion page
 * 不引入 @notionhq/client 官方 SDK，直接 fetch 调用 REST API
 */
import { stripWikiLinks } from './exporter'
import type {
  ExportResult,
  NotionTestConnectionParams,
  NotionTestConnectionResult,
} from './exporter-types'

// ===== Notion API 类型（精简，只覆盖本项目用到的） =====

export type NotionBlock =
  | { type: 'heading_1'; heading_1: { rich_text: NotionRichText[] } }
  | { type: 'heading_2'; heading_2: { rich_text: NotionRichText[] } }
  | { type: 'heading_3'; heading_3: { rich_text: NotionRichText[] } }
  | { type: 'paragraph'; paragraph: { rich_text: NotionRichText[] } }
  | { type: 'bulleted_list_item'; bulleted_list_item: { rich_text: NotionRichText[] } }
  | { type: 'numbered_list_item'; numbered_list_item: { rich_text: NotionRichText[] } }
  | { type: 'quote'; quote: { rich_text: NotionRichText[] } }
  | { type: 'to_do'; to_do: { rich_text: NotionRichText[]; checked: boolean } }
  | { type: 'divider'; divider: Record<string, never> }
  | { type: 'code'; code: { rich_text: NotionRichText[]; language: string } }

interface NotionRichText {
  type: 'text'
  text: { content: string; link?: { url: string } | null }
  annotations?: {
    bold: boolean
    italic: boolean
    strikethrough: boolean
    underline: boolean
    code: boolean
    color: string
  }
}

export interface NotionDatabaseSchema {
  titleProperty?: string // type=title 的列名
  properties: Record<string, { type: string }> // 列名 → type
}

interface NotionPageResponse {
  id: string
  url: string
  object: 'page'
}

interface NotionApiError {
  status: number
  code: string
  message: string
}

// ===== 工具函数 =====

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function notionFetch(
  pathname: string,
  init: RequestInit & { token: string },
): Promise<Response> {
  const { token, ...rest } = init
  return fetch(`${NOTION_API_BASE}${pathname}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...rest.headers,
    },
  })
}

export function buildRichText(text: string): NotionRichText[] {
  if (!text) return []
  // Notion rich_text 单个元素最多 2000 字符，超长截断
  const truncated = text.length > 2000 ? text.substring(0, 1997) + '...' : text
  return [{ type: 'text', text: { content: truncated } }]
}

// ===== frontmatter 解析（极简，复用 backlinks.ts 中的 parseFrontmatter 思路） =====

export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!fmMatch) {
    return { frontmatter: {}, body: markdown }
  }

  const fmText = fmMatch[1]
  const body = markdown.substring(fmMatch[0].length)
  const frontmatter: Record<string, unknown> = {}

  // 极简 YAML 解析：支持 key: value 和 key: [a, b, c] 两种格式
  const lines = fmText.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value: unknown = match[2].trim()
    // 去除两端引号
    if (typeof value === 'string' && /^['"].*['"]$/.test(value)) {
      value = value.slice(1, -1)
    }
    // 解析数组 [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim()
      if (!inner) {
        value = []
      } else {
        value = inner
          .split(',')
          .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      }
    }
    frontmatter[key] = value
  }

  return { frontmatter, body }
}

// ===== Notion database schema 获取 =====

async function getDatabaseSchema(token: string, databaseId: string): Promise<NotionDatabaseSchema> {
  const res = await notionFetch(`/databases/${databaseId}`, { token, method: 'GET' })
  if (res.status === 401) {
    const err = new Error('Notion Integration Token 无效或已过期') as Error & { status: number }
    err.status = 401
    throw err
  }
  if (res.status === 404) {
    const err = new Error('Notion Database 不存在或集成未共享该 database') as Error & {
      status: number
    }
    err.status = 404
    throw err
  }
  if (!res.ok) {
    const data = (await res.json()) as NotionApiError
    const err = new Error(`Notion API 错误: ${data.message}`) as Error & { status: number }
    err.status = res.status
    throw err
  }

  const data = (await res.json()) as { properties: Record<string, { type: string }> }
  const properties: Record<string, { type: string }> = {}
  let titleProperty: string | undefined
  for (const [name, info] of Object.entries(data.properties)) {
    properties[name] = { type: info.type }
    if (info.type === 'title') titleProperty = name
  }
  return { titleProperty, properties }
}

// ===== frontmatter → Notion properties =====

export function frontmatterToNotionProperties(
  frontmatter: Record<string, unknown>,
  schema: NotionDatabaseSchema,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}

  // title（必填，用 frontmatter.title 或 frontmatter.show 或文件名）
  if (schema.titleProperty) {
    const title = String(frontmatter.title || frontmatter.show || '')
    props[schema.titleProperty] = {
      type: 'title',
      title: buildRichText(title),
    }
  }

  // rich_text 字段
  for (const key of ['show', 'episode', 'host', 'guest', 'platform']) {
    const value = frontmatter[key]
    if (value !== undefined && value !== null && schema.properties[key]?.type === 'rich_text') {
      props[key] = {
        type: 'rich_text',
        rich_text: buildRichText(String(value)),
      }
    }
  }

  // date 字段
  const dateValue = frontmatter.date
  if (typeof dateValue === 'string' && dateValue && schema.properties.date?.type === 'date') {
    props.date = {
      type: 'date',
      date: { start: dateValue },
    }
  }

  // select 字段
  for (const key of ['category', 'platform']) {
    const value = frontmatter[key]
    if (typeof value === 'string' && value && schema.properties[key]?.type === 'select') {
      props[key] = {
        type: 'select',
        select: { name: value },
      }
    }
  }

  // multi_select 字段（tags）
  const tagsValue = frontmatter.tags
  if (
    tagsValue !== undefined &&
    tagsValue !== null &&
    schema.properties.tags?.type === 'multi_select'
  ) {
    const tags = Array.isArray(tagsValue) ? tagsValue : [tagsValue]
    props.tags = {
      type: 'multi_select',
      multi_select: tags.map(t => ({ name: String(t) })).filter(t => t.name),
    }
  }

  return props
}

// ===== markdown → Notion blocks =====

export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
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
            rich_text: buildRichText(codeBuffer.join('\n')),
            language: codeLang,
          },
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
      const richText = buildRichText(text)
      if (level === 1) {
        blocks.push({ type: 'heading_1', heading_1: { rich_text: richText } })
      } else if (level === 2) {
        blocks.push({ type: 'heading_2', heading_2: { rich_text: richText } })
      } else {
        blocks.push({ type: 'heading_3', heading_3: { rich_text: richText } })
      }
      continue
    }

    // 引用
    if (line.startsWith('> ')) {
      const text = stripWikiLinks(line.substring(2))
      blocks.push({
        type: 'quote',
        quote: { rich_text: buildRichText(text) },
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
        to_do: { rich_text: buildRichText(text), checked },
      })
      continue
    }

    // 无序列表
    if (/^-\s+/.test(line)) {
      const text = stripWikiLinks(line.replace(/^-\s+/, ''))
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: buildRichText(text) },
      })
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const text = stripWikiLinks(line.replace(/^\d+\.\s+/, ''))
      blocks.push({
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: buildRichText(text) },
      })
      continue
    }

    // 普通段落
    blocks.push({
      type: 'paragraph',
      paragraph: { rich_text: buildRichText(stripWikiLinks(line)) },
    })
  }

  return blocks
}

// ===== 重复检测 =====

async function findExistingNotionPage(
  token: string,
  databaseId: string,
  titleProperty: string,
  title: string,
): Promise<string | null> {
  try {
    const res = await notionFetch(`/databases/${databaseId}/query`, {
      token,
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: titleProperty,
          title: { equals: title },
        },
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { results: Array<{ url: string }> }
    return data.results?.[0]?.url || null
  } catch {
    return null
  }
}

// ===== 创建页面 =====

async function createNotionPage(params: {
  token: string
  databaseId: string
  properties: Record<string, unknown>
  children: NotionBlock[]
}): Promise<{ pageId: string; pageUrl: string }> {
  const res = await notionFetch('/pages', {
    token: params.token,
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: params.databaseId },
      properties: params.properties,
      children: params.children.slice(0, 100), // Notion 单次最多 100 blocks
    }),
  })

  if (res.status === 401) {
    const err = new Error('Notion Integration Token 无效或已过期') as Error & { status: number }
    err.status = 401
    throw err
  }
  if (res.status === 404) {
    const err = new Error('Notion Database 不存在') as Error & { status: number }
    err.status = 404
    throw err
  }
  if (res.status === 400) {
    const data = (await res.json()) as NotionApiError
    const err = new Error(`参数错误: ${data.message}`) as Error & { status: number }
    err.status = 400
    throw err
  }
  if (res.status === 409) {
    const err = new Error('页面冲突（同名页面已存在）') as Error & { status: number }
    err.status = 409
    throw err
  }
  if (res.status === 429) {
    const err = new Error('Notion API 速率限制，请稍后再试') as Error & { status: number }
    err.status = 429
    throw err
  }
  if (!res.ok) {
    const data = (await res.json()) as NotionApiError
    const err = new Error(`Notion API 错误: ${data.message}`) as Error & { status: number }
    err.status = res.status
    throw err
  }

  const data = (await res.json()) as NotionPageResponse
  return { pageId: data.id, pageUrl: data.url }
}

// ===== 测试连接 =====

export async function testNotionConnection(
  params: NotionTestConnectionParams,
): Promise<NotionTestConnectionResult> {
  const { token, databaseId } = params
  if (!token?.trim() || !databaseId?.trim()) {
    return { success: false, error: 'Token 和 Database ID 不能为空' }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId.trim()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Notion-Version': NOTION_VERSION,
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.status === 401) return { success: false, error: 'Integration Token 无效或已过期' }
    if (res.status === 404)
      return { success: false, error: 'Database 不存在或集成未共享该 database' }
    if (!res.ok) {
      const data = (await res.json()) as NotionApiError
      return { success: false, error: `Notion API 错误: ${data.message}` }
    }

    const data = (await res.json()) as { title?: Array<{ plain_text: string }> }
    const title = data.title?.[0]?.plain_text || '未命名'
    return { success: true, databaseTitle: title }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? '请求超时（30s）' : (e as Error).message
    return { success: false, error: `网络错误: ${msg}` }
  }
}

// ===== 总入口 =====

export async function exportToNotion(params: {
  token: string
  databaseId: string
  markdown: string
  relativePath: string
}): Promise<ExportResult> {
  const { token, databaseId, markdown, relativePath } = params

  // 0. 空凭据前置校验（与 testNotionConnection 一致；exportNote 已有更高层校验，这里是防御性兜底）
  if (!token?.trim() || !databaseId?.trim()) {
    return { success: false, error: 'Token 和 Database ID 不能为空' }
  }

  // 1. 解析 frontmatter
  const { frontmatter, body } = parseFrontmatter(markdown)

  // 2. 拿 database schema（决定哪些 frontmatter 字段能映射）
  const schema = await getDatabaseSchema(token, databaseId)

  // 3. 重复检测
  const titleValue = String(frontmatter.title || frontmatter.show || '')
  const fallbackTitle = titleValue || relativePath.replace(/\.md$/, '')
  if (schema.titleProperty && titleValue) {
    const existingUrl = await findExistingNotionPage(
      token,
      databaseId,
      schema.titleProperty,
      titleValue,
    )
    if (existingUrl) {
      return {
        success: false,
        error: 'Notion database 中已存在同名页面，请先手动处理或修改笔记标题',
        pageUrl: existingUrl,
      }
    }
  }

  // 4. 转换
  const properties = frontmatterToNotionProperties(frontmatter, schema)
  // 确保 title property 有值（frontmatter 无 title 时 fallback 到文件名）
  // 注意：frontmatterToNotionProperties 总是先写入 title（可能为空数组），
  // 因此不能只判断属性是否存在，要判断 title 数组是否为空
  if (schema.titleProperty) {
    const existingTitle = properties[schema.titleProperty] as { title?: unknown[] } | undefined
    if (!existingTitle?.title?.length) {
      properties[schema.titleProperty] = {
        type: 'title',
        title: buildRichText(fallbackTitle),
      }
    }
  }
  const children = markdownToNotionBlocks(body)

  // 5. 创建页面
  const { pageId, pageUrl } = await createNotionPage({
    token,
    databaseId,
    properties,
    children,
  })

  return { success: true, pageId, pageUrl }
}
