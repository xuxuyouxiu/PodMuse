/**
 * 设置页剪贴板无感填充：字段级识别规则（docs/无感配置方案.md §3.3 每步正则的延续）。
 * 纯函数供 TabApi / TabExport 与 vitest 复用；剪贴板内容绝不写日志（hook 只记命中类型 id）。
 *
 * 特征化规则：
 * - 飞书 App ID：cli_ 前缀
 * - 飞书群聊 Chat ID：oc_ 前缀
 * - Notion token：secret_ 前缀
 * - Notion database ID：32 位 hex（可混在 database URL 中，如 notion.so/ws/<id>?...）
 * - 飞书 App Secret：无特征化 → 只能走字段旁「粘贴」按钮兜底
 * 边界：值前后必须是非字母数字（允许空白/换行/标签文字），防止从更长字符串截取片段。
 */
import type { ClipPattern } from '../hooks/useClipboardFill'

export type FieldKind = 'feishu-app-id' | 'feishu-chat-id' | 'notion-token' | 'notion-database-id'

const RE_APP_ID = /(?:^|[^a-z0-9])(cli_[a-z0-9]{8,})(?=$|[^a-z0-9])/i
const RE_CHAT_ID = /(?:^|[^a-z0-9])(oc_[a-z0-9]{8,})(?=$|[^a-z0-9])/i
const RE_NOTION_TOKEN = /(?:^|[^a-z0-9])(secret_[a-z0-9]{8,})(?=$|[^a-z0-9])/i
const RE_NOTION_DB_ID = /(?:^|[^a-f0-9])([a-f0-9]{32})(?=$|[^a-f0-9])/i

/** 提取第一个捕获组；无命中返回 null（显式重置 lastIndex 防 /g 状态残留） */
function capture(re: RegExp, text: string): string | null {
  re.lastIndex = 0
  const m = re.exec(text)
  return m ? m[1] : null
}

/** 纯函数：按字段类型从剪贴板文本提取值；无特征化或未命中返回 null */
export function extractFieldValue(text: string, kind: FieldKind): string | null {
  const trimmed = (text || '').trim()
  if (!trimmed) return null
  switch (kind) {
    case 'feishu-app-id':
      return capture(RE_APP_ID, trimmed)
    case 'feishu-chat-id':
      return capture(RE_CHAT_ID, trimmed)
    case 'notion-token':
      return capture(RE_NOTION_TOKEN, trimmed)
    case 'notion-database-id':
      return capture(RE_NOTION_DB_ID, trimmed)
  }
}

/** 各字段对应的 ClipPattern（TabApi / TabExport 逐字段 useClipboardFill 用） */
export const FEISHU_APP_ID_PATTERN: ClipPattern = {
  id: 'feishu-app-id',
  regex: RE_APP_ID,
  extract: text => extractFieldValue(text, 'feishu-app-id'),
}

export const FEISHU_CHAT_ID_PATTERN: ClipPattern = {
  id: 'feishu-chat-id',
  regex: RE_CHAT_ID,
  extract: text => extractFieldValue(text, 'feishu-chat-id'),
}

export const NOTION_TOKEN_PATTERN: ClipPattern = {
  id: 'notion-token',
  regex: RE_NOTION_TOKEN,
  extract: text => extractFieldValue(text, 'notion-token'),
}

export const NOTION_DB_ID_PATTERN: ClipPattern = {
  id: 'notion-database-id',
  regex: RE_NOTION_DB_ID,
  extract: text => extractFieldValue(text, 'notion-database-id'),
}
