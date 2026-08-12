/**
 * QA 服务 — 检索 + Prompt 组装 + 流式 LLM 生成
 */

import { KeywordRetriever, RetrievedChunk } from './qa-retriever'
import { buildApiUrl } from './ai-client'
import type { AIProviderId } from '../shared/types'

const SYSTEM_PROMPT = `你是一个播客笔记知识库的问答助手。用户会提问，你会收到从用户笔记中检索出的相关片段（带编号）。

回答规则：
1. 只根据提供的片段回答，绝不编造片段之外的信息
2. 回答中引用信息时，在句末标注片段编号，如 [1][2]
3. 如果片段不足以回答，明确说"你的笔记中没有找到相关内容"
4. 用简体中文回答，简洁有条理，可用 Markdown 列表
5. 不要提及"片段""检索"等内部机制`

const MAX_CHUNKS = 8
const MAX_CHARS_PER_CHUNK = 400

export interface QASource {
  title: string
  path: string
  entityType?: string
}

export interface QAAnswer {
  answer: string
  sources: QASource[]
}

function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  const parts = chunks.map((c, i) => {
    const excerpt =
      c.excerpt.length > MAX_CHARS_PER_CHUNK
        ? c.excerpt.slice(0, MAX_CHARS_PER_CHUNK) + '…'
        : c.excerpt
    return `[${i + 1}] 来源《${c.title}》：${excerpt}`
  })
  return `参考资料：\n${parts.join('\n\n')}\n\n用户问题：${question}`
}

/**
 * 执行问答：检索 → 流式生成
 * @param onChunk 每段生成文本的回调
 * @returns { answer, sources }
 */
export async function askQuestion(
  obsidianDir: string,
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: string,
  question: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<QAAnswer> {
  // 1. 检索
  const retriever = new KeywordRetriever(obsidianDir)
  const chunks = await retriever.retrieve(question, MAX_CHUNKS)

  if (chunks.length === 0) {
    return {
      answer: '你的笔记中没有找到与这个问题相关的内容。',
      sources: [],
    }
  }

  const sources: QASource[] = chunks.map(c => ({
    title: c.title,
    path: c.path,
    entityType: c.entityType,
  }))

  // 2. 流式调用 LLM
  const apiUrl = buildApiUrl(providerConfig.baseUrl, providerId as AIProviderId)
  const timeoutSignal = AbortSignal.timeout(60_000)
  const mergedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  const resp = await fetch(apiUrl, {
    method: 'POST',
    signal: mergedSignal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, chunks) },
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 1500,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`AI 服务返回 ${resp.status}: ${text.slice(0, 200)}`)
  }

  // 3. 解析 SSE 流
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta: string = json.choices?.[0]?.delta?.content || ''
        if (delta) {
          answer += delta
          onChunk(delta)
        }
      } catch {
        /* 忽略非 JSON 行（keep-alive 注释等） */
      }
    }
  }

  return { answer, sources }
}
