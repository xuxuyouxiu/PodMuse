/**
 * Notion 数据库列表（手动 Token 模式）：供设置页「刷新数据库列表」下拉使用。
 * 只返回数据库名称与 id，绝不把 token 写入任何输出。
 */
import { loadConfig } from './config'

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export interface NotionDatabaseInfo {
  id: string
  title: string
}

/** 纯函数：把 /v1/search 响应映射为数据库列表（便于测试） */
export function mapNotionDatabases(json: unknown): NotionDatabaseInfo[] {
  const results = (json as { results?: unknown[] } | null)?.results
  if (!Array.isArray(results)) return []
  const out: NotionDatabaseInfo[] = []
  for (const r of results) {
    const rec = r as { object?: string; id?: string; title?: Array<{ plain_text?: string }> }
    if (rec?.object !== 'database' || typeof rec.id !== 'string' || !rec.id) continue
    const title = Array.isArray(rec.title)
      ? rec.title.map(t => t?.plain_text ?? '').join('')
      : ''
    out.push({ id: rec.id, title: title || rec.id.slice(0, 8) })
  }
  return out
}

/** 列出当前 Token 可访问的数据库（≤100 个） */
export async function listNotionDatabases(): Promise<{
  success: boolean
  databases: NotionDatabaseInfo[]
  error?: string
}> {
  const token = loadConfig().export?.notion?.token?.trim()
  if (!token) return { success: false, databases: [], error: '未配置 Notion Token' }
  try {
    const resp = await fetch(`${NOTION_API_BASE}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 100 }),
      signal: AbortSignal.timeout(12000),
    })
    if (resp.status === 401 || resp.status === 403) {
      return { success: false, databases: [], error: 'Notion Token 无效或无权限' }
    }
    if (!resp.ok) return { success: false, databases: [], error: `Notion API 错误: HTTP ${resp.status}` }
    const json = await resp.json().catch(() => null)
    return { success: true, databases: mapNotionDatabases(json) }
  } catch {
    return { success: false, databases: [], error: '网络不可达，请检查网络后重试' }
  }
}
