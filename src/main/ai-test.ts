/**
 * AI 测试连接：向配置的 baseUrl 发送一个最小 chat/completions 请求
 * （max_tokens=1，messages=[ping]），验证 API Key 与地址可用性。
 *
 * 错误码映射：
 *   HTTP 401 → invalid_key（API Key 无效）
 *   HTTP 403 → no_permission_or_balance（无权限或余额不足）
 *   HTTP 404 → bad_url（地址错误，检查是否需 /v1）
 *   HTTP 429 → rate_limited（限流）
 *   超时 / 网络 → network
 *   其他 → unknown
 *
 * 安全约束：detail 只含状态码与脱敏摘要——apiKey 出现即替换为 ****，
 * 响应体只提取关键 error 字段且限长，绝不回传全文。
 */
import { normalizeBaseUrl } from './ai-providers'
import { buildApiUrl } from './ai-client'
import type { AITestParams, AITestResult } from '@shared/types'

const TIMEOUT_MS = 12_000
const DETAIL_MAX_LEN = 200

/** 响应体 → 可读摘要：优先取 JSON error.message / error.code，兜底原文（脱敏前） */
function extractErrorSummary(body: string): string {
  if (!body) return ''
  try {
    const parsed = JSON.parse(body)
    const err = (parsed as { error?: unknown })?.error
    if (err && typeof err === 'object') {
      const e = err as { message?: unknown; code?: unknown; type?: unknown }
      const parts: string[] = []
      if (typeof e.code === 'string' && e.code) parts.push(e.code)
      if (typeof e.type === 'string' && e.type) parts.push(e.type)
      if (typeof e.message === 'string' && e.message) parts.push(e.message)
      if (parts.length > 0) return parts.join(': ')
    }
    if (typeof err === 'string' && err) return err
    const msg = (parsed as { message?: unknown })?.message
    if (typeof msg === 'string' && msg) return msg
  } catch {
    // 非 JSON，走原文截断
  }
  return body
}

/** 脱敏：替换 apiKey、去控制字符、压缩空白、限长 */
function sanitizeDetail(text: string, apiKey: string): string {
  let s = text || ''
  if (apiKey) s = s.split(apiKey).join('****')
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > DETAIL_MAX_LEN) s = s.slice(0, DETAIL_MAX_LEN) + '…'
  return s
}

export async function testAIConnection(params: AITestParams): Promise<AITestResult> {
  const { baseUrl, apiKey, model, providerId } = params
  if (!baseUrl?.trim() || !apiKey?.trim()) {
    return { success: false, code: 'unknown', detail: '请先填写 API 地址和 API Key' }
  }
  if (!model?.trim()) {
    return { success: false, code: 'unknown', detail: '请先选择或填写模型' }
  }

  // 统一走 normalizeBaseUrl（版本化路径如智谱 /api/paas/v4 不追加 /v1）+ buildApiUrl
  const url = buildApiUrl(normalizeBaseUrl(baseUrl), providerId)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (resp.ok) {
      return { success: true, code: 'ok', detail: `HTTP ${resp.status}` }
    }

    const bodyText = await resp.text().catch(() => '')
    const summary = sanitizeDetail(extractErrorSummary(bodyText), apiKey)

    switch (resp.status) {
      case 401:
        return {
          success: false,
          code: 'invalid_key',
          detail: `HTTP 401：API Key 无效或已过期${summary ? `（${summary}）` : ''}`,
        }
      case 403:
        return {
          success: false,
          code: 'no_permission_or_balance',
          detail: `HTTP 403：无权限或余额不足${summary ? `（${summary}）` : ''}`,
        }
      case 404:
        return {
          success: false,
          code: 'bad_url',
          detail: `HTTP 404：接口不存在，请检查 API 地址（是否需 /v1）${summary ? `（${summary}）` : ''}`,
        }
      case 429:
        return {
          success: false,
          code: 'rate_limited',
          detail: `HTTP 429：请求被限流，请稍后重试${summary ? `（${summary}）` : ''}`,
        }
      default:
        return {
          success: false,
          code: 'unknown',
          detail: `HTTP ${resp.status}${summary ? `: ${summary}` : ''}`,
        }
    }
  } catch (err) {
    const name = (err as Error)?.name || ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { success: false, code: 'network', detail: `请求超时（${TIMEOUT_MS / 1000} 秒）` }
    }
    const msg = (err as Error)?.message || ''
    return {
      success: false,
      code: 'network',
      detail: msg ? `网络连接失败：${sanitizeDetail(msg, apiKey)}` : '网络连接失败',
    }
  }
}
