import type { AIProviderId } from '../shared/types'
import * as fs from 'fs'
import * as path from 'path'

// 重试配置
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000 // 1秒基础延迟
const MAX_DELAY_MS = 10000 // 最大延迟10秒

// ── Prompt 模板外部加载 ──

let promptDir: string | null = null

export function setPromptDir(dir: string): void {
  promptDir = dir
}

function loadExternalPrompt(filename: string): string | null {
  if (!promptDir) return null
  const filePath = path.join(promptDir, filename)
  try {
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return null
    return content
  } catch {
    return null
  }
}

export function exportBuiltInTemplates(): void {
  if (!promptDir) return
  try {
    if (!fs.existsSync(promptDir)) fs.mkdirSync(promptDir, { recursive: true })
    const notePath = path.join(promptDir, 'note-generation.default.md')
    const correctionPath = path.join(promptDir, 'transcript-correction.default.md')
    if (!fs.existsSync(notePath)) {
      fs.writeFileSync(notePath, BUILT_IN_NOTE_PROMPT_CORE + AI_PROMPT, 'utf-8')
    }
    if (!fs.existsSync(correctionPath)) {
      fs.writeFileSync(correctionPath, CORRECTION_PROMPT, 'utf-8')
    }
  } catch (e) {
    console.log(`⚠ 导出内置模板失败: ${e instanceof Error ? e.message : e}`)
  }
}

const CORRECTION_PROMPT = `你是一位专业的转录校对员。以下是一段语音识别（Whisper）生成的播客逐字稿。语音识别对同音词和专有名词的识别经常出错。

这段播客可能包含中文、英文或中英混合内容。请逐句修正以下类型的错误，输出修正后的完整逐字稿：

1. **人名与专有名词**：无论中英文，如 纪凡西→纪梵希、乔不死→乔布斯、马斯客→马斯克、Joe Bidden→Joe Biden
2. **品牌/产品名**：如 牙幼稚→牙釉质、华未→华为、Tesler→Tesla、Appel→Apple
3. **技术术语**：如 丁杰学习→机器学习、深渡学习→深度学习、大禹言模型→大语言模型、Mechine Learning→Machine Learning
4. **英文单词拼写**：修正明显拼错的英文单词和短语
5. **书籍/影视/节目名**：还原为正确的作品名称
6. **成语和固定搭配**：修正同音错字

要求：
- 保持原文的中英混合风格，不要将英文翻译成中文，也不要将中文翻译成英文
- 只修正明显的语音识别错误，不要改动原文的意思和表达方式
- 保持原有的段落结构和标点
- 直接输出修正后的完整文本，不要添加任何解释说明

原始转录：

{transcript}

修正后的转录：`

const AI_PROMPT = `

---

输出格式说明：

你的输出由三部分组成：**元数据**（固定）、**内容模块**（自选）、**实体卡片**（固定格式）。

## 第一部分：元数据（必须输出）

以 YAML frontmatter 开头，格式如下：

---
type: podcast
show: 《节目名称》
episode: 第X期（从标题中推断，如果标题没有期号则填"单集"）
host: [主持人]
guest: [嘉宾，没有则填"无"]
date: {date}
tags: [根据内容自动生成3-5个标签]
category: [从以下4个类别中选择最匹配的一个：科技商业（AI/编程/互联网/创业/投资/管理/经济/技术）、每日资讯（新闻/时事/热点/行业动态）、社会心理（社会/心理/人际关系/职场/教育/哲学）、生活文化（生活/健康/旅行/美食/历史/艺术/文学）。只填类别名称，不要加括号内的说明。]
---

然后紧跟一个「# 一句话总结」，用一句话概括本期播客的核心内容。

## 第二部分：内容模块（自主选择）

以下是可用的内容模块。请根据播客的实际内容，**自主选择最合适的模块组合**。

选择原则：
- **必须包含**：「主要内容概览」和「术语词典」
- **按需选择**：其他模块根据内容相关性决定是否包含
- **不需要的模块直接跳过**：不要输出模块标题，不要写"本期未提及"，不要留空章节
- **顺序自由**：按你认为最合理的逻辑顺序排列模块
- **内容充实**：选中的模块要有足够的信息密度，不要只用一两句话敷衍
- **正文必须有链接**：所有正文模块（A/B/C/D/E）中首次出现的人名、公司/品牌/项目名、术语名必须用 [[名称]] 包裹

### 可选模块清单

**A. 主要内容概览**（必选）
用结构化的列表概括本期播客涉及的所有主要内容点。确保覆盖从头到尾的所有重要内容，不遗漏后半部分。⚠️ 首次出现的人名/公司名/项目名/术语名用 [[名称]] 包裹。
格式参考：
\`\`\`
# 本期主要内容
- 要点1：[[公司A]]的[[项目B]]发布了新版本
- 要点2：[[人物C]]认为[[概念D]]将改变行业
- ...
\`\`\`

**B. 核心观点提炼**
当播客有明确的观点表达时使用（如访谈、评论、演讲类）。按人物分别列出各自的核心观点。如果是新闻资讯类，改为按事件提炼要点。⚠️ 观点内容中首次出现的人名/公司名/项目名/术语名用 [[名称]] 包裹。
格式参考：
\`\`\`
# 核心观点
## [[人物名]]
- [[项目X]]的[[功能Y]]体现了...
- 观点2
\`\`\`

**C. 事件详情与深度分析**
当需要对每条新闻/事件展开详细分析时使用。特别适合新闻资讯类型——每条新闻独立展开，包含事件摘要（50-100字）、影响分析、关键数据、相关方及立场。⚠️ 事件描述中首次出现的人名/公司名/项目名/术语名用 [[名称]] 包裹。
格式参考：
\`\`\`
# 事件详情
## 事件标题
**事件概要**：[[公司A]]发布了[[产品B]]...
**影响分析**：对[[行业C]]的影响...
**关键数据**：...
**相关方**：[[人物D]]认为...
\`\`\`

**D. 关键对话还原**
当播客中有精彩的对话交锋、问答互动时使用。用引用格式（>）保留原话，标注对话主题。⚠️ 对话前后的说明文字中，人名用 [[名称]] 包裹。**新闻资讯、每日简报等不涉及对话场景的内容类型不要使用此模块。**
格式参考：
\`\`\`
# 关键对话还原
> 主题：xxx
> [[发言人A]]：...
> [[发言人B]]：...
\`\`\`

**E. 金句摘录**
当播客中有值得收藏的精彩表述、名言警句时使用。
格式参考：
\`\`\`
# 金句摘录
> "原话内容" —— [[说话人]]
\`\`\`

**F. 关联延伸**
当播客中提及了可以进一步探索的书籍、论文、项目、方向时使用。所有引用使用 [[xxx]] 格式。
格式参考：
\`\`\`
# 关联延伸
- 书籍：[[书名]]
- 人物：[[人物]]
- 可深入了解的方向：...
\`\`\`

**G. 术语词典**（必选）
作为术语名称索引，每个术语用 [[术语名]] 格式包裹。术语的完整解释放在对应的 CARD-TERM 卡片中。列出的每一个术语都必须生成对应的 CARD-TERM 卡片，不允许遗漏。
格式参考：
\`\`\`
# 术语词典（索引）
> 术语的完整释义已迁移至对应卡片，此处仅保留术语名称。

- [[术语1]]
- [[术语2]]
\`\`\`

**H. 关联实体索引**
在笔记末尾汇总本期涉及的所有人物、项目、概念的 wiki-link。分类提示：人名放在「关联人物」，公司/品牌/产品放在「关联项目」，抽象概念/理论/现象放在「关联概念」。同一实体选择最匹配的一种类型即可，不要在多个分类中重复。
格式参考：
\`\`\`
# 关联人物
- [[人物名]]

# 关联项目
- [[项目名]]

# 关联概念
- [[概念名]]
\`\`\`

## 第三部分：实体卡片（固定格式，必须输出在笔记正文之后）

请检测本期播客中提到的所有重要实体，按以下格式输出。
注意：
- 如果某类实体没有提及，不要输出对应的 ---CARD-*--- 块
- 如果某类实体有多个，每段之间用空行隔开
- 字段值如果跨多行，保持缩进对齐
- 嘉宾已在 guest frontmatter 中列出，无需再输出人物卡片
- ⚠️ **人物卡片硬性门槛（务必遵守）：**
  仅当人物同时满足以下所有条件时才输出 CARD-PEOPLE 卡片：
  (1) 在公开领域有公认成就（如企业家、学者、艺术家、行业领袖、知名作家等）
  (2) 有公开的百度百科词条或维基百科页面级别的知名度
  (3) 在播客中被作为行业权威引用其观点或经历
  以下人物**绝对禁止**生成卡片，即使他们在播客中发了言：
  - 自媒体博主、UP主、网红（除非已达到罗翔/李永乐级别的公众知名度）
  - 仅有网名/昵称/代号、无法查到真实公开身份的人物（如"XX妈妈""XX君""XX学长"等）
  - 播客主持人自身（已通过 host/guest 记录，不需要卡片）
  - 普通从业者、爱好者、没有公认成就的个人
  - 如果不确定某人是否满足门槛，**宁可不生成卡片**
- **术语词典中出现的每一个术语都必须有对应的 CARD-TERM 卡片，严禁遗漏**

---CARD-PEOPLE---
姓名：张三
角色：AI 创业者 / 学者 / 行业专家
核心观点：
  他认为AI时代最重要的能力是沟通能力。
  他不觉得中年人会被AI取代。
时间轴：12:30-18:45 讨论AI对工作影响
金句：[从播客中摘录的该人物代表性原话，无则留空]
---CARD-PEOPLE-END---

---CARD-PROJECT---
项目名称：小宇宙
核心定位：中文播客平台
提及时间点：05:00-08:30, 22:10-25:00
相关链接：https://xiaoyuzhoufm.com
关键成果：中文播客领域的头部平台之一
---CARD-PROJECT-END---

---CARD-CONCEPT---
概念名称：向量数据库
核心解释：一种能理解数据语义关系的数据库，而非仅靠关键词匹配
相关概念：[[传统数据库]], [[AI Agent]], [[RAG]]
---CARD-CONCEPT-END---

---CARD-TERM---
术语名称：大语言模型
卡片类型：技术术语
上下文解释：在本期播客中特指 DeepSeek、GPT 这类生成式AI的基础模型，嘉宾用它来对比传统 NLP 模型在处理长文本理解上的能力差异。
补充说明：大语言模型（LLM）通过海量文本训练获得语言理解与生成能力，在播客场景中主要用于自动生成笔记摘要。
相关术语：[[Transformer]], [[提示工程]], [[RAG]]
---CARD-TERM-END---

请处理以下逐字稿：

{transcript}
`

// 内置笔记 prompt 的「核心原则」部分（不含格式说明）
const BUILT_IN_NOTE_PROMPT_CORE = `你是一位专业的知识管理助手。请根据以下播客节目的逐字稿，生成一份结构化的知识笔记。

这段播客可能包含中文、英文或中英混合内容。

核心原则：
1. 输出为纯 Markdown 格式，按照下方的「输出格式说明」组织内容。不要添加任何开场白、结尾语或格式说明以外的解释文字（例如不要写"好的，请查收"）。
2. **最重要原则——内容完整性优先于一切：必须覆盖逐字稿中从头到尾的所有事件、话题和内容点，一个都不能少。** 宁可多写，也不要遗漏。每条新闻、每个话题都必须独立成段。同一事件不要重复出现两次。
3. 语言使用简体中文（播客中的英文内容保留原文）。
4. **正文内联链接（所有模块必须遵守）**：在正文中——包括内容概览、核心观点、事件详情、对话还原等所有章节——首次出现的人物名、公司/品牌名、项目名、术语名时，**必须**用 [[名称]] 格式包裹。这条规则适用于每一个内容模块，不可省略。
   ✅ 正确："[[Apple]]谈到[[OPC]]模式和[[Polymarket]]的套利机会，认为[[AI coding]]降低了创业门槛"
   ❌ 错误："Apple谈到OPC模式和Polymarket的套利机会，认为AI coding降低了创业门槛"
5. **人物卡片硬性筛选（最高优先级）：** 绝对不要为没有公开知名度的人物生成 CARD-PEOPLE 卡片。如果不确定某人是否符合条件，跳过他。
6. **自动识别内容类型**：请先判断这段播客属于什么类型（新闻资讯、长文演讲/教程、还是通用访谈等），然后根据类型特点自主选择最合适的模块组合和信息密度：
   - 新闻资讯类：每条新闻/事件必须独立展开详细分析（事件摘要、影响分析、关键数据），不要合并概括；不要使用"关键对话还原"模块
   - 长文/演讲/教程类：保留所有具体例子、案例和论证过程，不要只写结论
   - 通用访谈/对话类：按内容相关性自由选择模块`

// 根据内容类型生成完整的 prompt（优先使用外部模板）
function getAIPrompt(): string {
  const external = loadExternalPrompt('note-generation.md')
  if (external) {
    console.log('📝 使用外部 prompt 模板: note-generation.md')
    return external + AI_PROMPT
  }
  return BUILT_IN_NOTE_PROMPT_CORE + AI_PROMPT
}

// 构建请求URL
export function buildApiUrl(baseUrl: string, _providerId: AIProviderId): string {
  // 确保 baseUrl 以 /v1 结尾
  let url = baseUrl.replace(/\/+$/, '')
  if (!url.endsWith('/v1')) {
    url += '/v1'
  }
  return `${url}/chat/completions`
}

// 判断错误是否可重试
function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''

  // 网络错误、超时、连接重置
  if (name === 'TypeError' && msg.includes('fetch')) return true
  if (name === 'AbortError') return true

  // HTTP 状态码错误
  if (msg.includes('HTTP')) {
    const statusMatch = msg.match(/HTTP (\d+)/)
    if (statusMatch) {
      const status = parseInt(statusMatch[1])
      // 429 请求过多、5xx 服务器错误可重试
      if (status === 429 || status >= 500) return true
      // 4xx 客户端错误（除了429）不可重试
      if (status >= 400 && status < 500) return false
    }
  }

  // API 特定错误
  if (msg.includes('API 错误') || msg.includes('API error')) {
    if (
      msg.includes('rate_limit') ||
      msg.includes('overloaded') ||
      msg.includes('timeout') ||
      msg.includes('insufficient_quota')
    ) {
      return true
    }
  }

  return false
}

// 计算延迟时间（指数退避）
function getDelay(retryCount: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS)
  // 添加随机抖动（±20%）
  const jitter = delay * 0.2 * (Math.random() * 2 - 1)
  return Math.max(0, delay + jitter)
}

// 通用AI API调用
async function callAI(
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: AIProviderId,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
  signal?: AbortSignal,
  temperature = 0.7,
) {
  const apiUrl = buildApiUrl(providerConfig.baseUrl, providerId)

  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw Object.assign(new Error('已取消'), { name: 'AbortError' })
    }

    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: providerConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      })

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '')
        throw new Error(`API HTTP ${resp.status}: ${errorText}`)
      }

      const result = (await resp.json()) as {
        error?: { message?: string }
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          completion_tokens_details?: { reasoning_tokens?: number }
        }
      }
      if (result.error) {
        throw new Error(`API 错误: ${result.error.message || JSON.stringify(result.error)}`)
      }

      const content = result.choices?.[0]?.message?.content
      const finishReason = result.choices?.[0]?.finish_reason || ''
      const usage = result.usage || {}
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens || 0
      // 简单估算成本（不同供应商价格不同，这里用通用估算）
      const cost = (usage.prompt_tokens || 0) * 0.000001 + (usage.completion_tokens || 0) * 0.000002

      // 推理模型可能在 reasoning 阶段耗尽 max_tokens 导致 content 为空
      if (!content && finishReason === 'length' && reasoningTokens > 0) {
        console.log(
          `⚠ 模型返回空内容: reasoning_tokens=${reasoningTokens} 耗尽了 max_tokens=${maxTokens}（finish_reason=length）。考虑增大 max_tokens 或使用非推理模型。`,
        )
      } else if (!content) {
        console.log(
          `⚠ 模型返回空内容: finish_reason=${finishReason}, usage=${JSON.stringify(usage)}`,
        )
      }

      return { content: content || null, cost, finishReason }
    } catch (error: unknown) {
      lastError = error

      // 如果是用户主动取消，直接抛出
      const errName = error instanceof Error ? error.name : ''
      if (signal?.aborted || errName === 'AbortError') {
        throw error
      }

      // 如果是最后一次尝试或错误不可重试，抛出错误
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error
      }

      // 等待后重试
      const delay = getDelay(attempt)
      const errDetail = error instanceof Error ? error.message : String(error)
      console.log(
        `AI API 调用失败，${(delay / 1000).toFixed(1)}秒后重试 (${attempt + 1}/${MAX_RETRIES}): ${errDetail}`,
      )

      // 等待延迟，但可被取消
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, delay)

        if (signal) {
          const abortHandler = () => {
            clearTimeout(timeoutId)
            reject(Object.assign(new Error('已取消'), { name: 'AbortError' }))
          }

          signal.addEventListener('abort', abortHandler, { once: true })

          setTimeout(() => {
            signal.removeEventListener('abort', abortHandler)
          }, delay + 100)
        }
      })
    }
  }

  throw lastError || new Error('AI API 调用失败')
}

// 导出的函数：校正转录
export async function correctTranscript(
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: AIProviderId,
  transcript: string,
  signal?: AbortSignal,
) {
  const external = loadExternalPrompt('transcript-correction.md')
  const promptTemplate = external || CORRECTION_PROMPT
  if (external) {
    console.log('📝 使用外部 prompt 模板: transcript-correction.md')
  }
  // 推理模型需要更多 max_tokens 预算（reasoning + content）
  // 按转写长度估算：中文约 1.5 字符/token，加上 reasoning 余量
  const estimatedTokens = Math.ceil(transcript.length / 1.5)
  const maxTokens = Math.max(8192, Math.min(32768, estimatedTokens + 4096))
  return callAI(
    providerConfig,
    providerId,
    '转录校对员',
    promptTemplate.replace('{transcript}', transcript),
    maxTokens,
    signal,
  )
}

// 导出的函数：生成笔记
export async function generateNotes(
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: AIProviderId,
  transcript: string,
  signal?: AbortSignal,
  metadata?: Record<string, string>,
  onSegmentProgress?: (current: number, total: number) => void,
) {
  const date = new Date().toISOString().split('T')[0]
  const prompt = getAIPrompt()

  // 构建平台元数据上下文，注入到 transcript 之前
  let transcriptWithContext = transcript
  if (metadata && Object.keys(metadata).length > 1) {
    const parts: string[] = []
    if (metadata.owner) parts.push(`内容创作者/UP主：${metadata.owner}`)
    if (metadata.channel) parts.push(`频道/作者：${metadata.channel}`)
    if (metadata.description && metadata.description.length > 100) {
      parts.push(`内容简介：${metadata.description.slice(0, 300)}`)
    }
    if (parts.length > 0) {
      const platform = metadata.platform || '未知平台'
      transcriptWithContext = `[来源平台：${platform}]\n${parts.join('\n')}\n---\n\n${transcript}`
    }
  }

  // 长文本分段处理：超过阈值时走分段流程
  if (transcriptWithContext.length > SEGMENT_THRESHOLD) {
    return generateNotesSegmented(
      providerConfig,
      providerId,
      transcriptWithContext,
      date,
      signal,
      onSegmentProgress,
    )
  }

  return callAI(
    providerConfig,
    providerId,
    '知识管理助手',
    prompt.replace('{date}', date).replace('{transcript}', transcriptWithContext),
    16384,
    signal,
    0.3,
  )
}

// ── 分段处理 ──

const SEGMENT_THRESHOLD = 30000
const SEGMENT_SIZE = 22000
const SEGMENT_OVERLAP = 500
const MAX_SEGMENTS = 3

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface SegmentResult {
  index: number
  content: string
  cost: number
}

function splitTranscript(text: string): string[] {
  const segments: string[] = []
  let pos = 0

  while (pos < text.length && segments.length < MAX_SEGMENTS) {
    const end = pos + SEGMENT_SIZE

    if (end >= text.length) {
      segments.push(text.slice(pos))
      break
    }

    // 找段落边界（双换行或单换行）
    let breakPoint = text.lastIndexOf('\n\n', end)
    if (breakPoint <= pos + SEGMENT_SIZE * 0.5) {
      breakPoint = text.lastIndexOf('\n', end)
    }
    if (breakPoint <= pos + SEGMENT_SIZE * 0.5) {
      breakPoint = end // 找不到合适边界就硬切
    }

    segments.push(text.slice(pos, breakPoint))
    // 下一段从 breakPoint - overlap 开始，保留上下文
    pos = breakPoint - SEGMENT_OVERLAP
    if (pos < 0) pos = breakPoint
  }

  // 如果还有剩余文本且已达 MAX_SEGMENTS，追加到最后一段
  if (pos < text.length && segments.length === MAX_SEGMENTS) {
    const remaining = text.slice(pos)
    if (remaining.length > 500) {
      console.log(`⚠ 播客文本过长，已截断 ${remaining.length} 字符（超出 ${MAX_SEGMENTS} 段上限）`)
    }
  }

  return segments
}

const SEGMENT_FOLLOWUP_PROMPT = `你是一位专业的知识管理助手。你正在处理一段较长的播客逐字稿，已根据前面的内容生成了一份笔记。现在请针对以下新增的逐字稿内容，**仅补充前面笔记中尚未覆盖的新内容**。

输出格式（严格遵守，不要添加其他内容）：

## 新增要点
- 列出本段中出现的新内容要点（如果前面已覆盖则不重复）

## 新增实体
### 人物
- 姓名：xxx
  角色：xxx
  核心观点：xxx
### 项目
- 项目名称：xxx
  核心定位：xxx
### 概念
- 概念名称：xxx
  核心解释：xxx
### 术语
- 术语名称：xxx
  卡片类型：xxx
  上下文解释：xxx

## 新增术语词典条目
- [[术语名]]

如果本段没有新增内容，输出"（本段无新增内容）"。

已生成笔记的要点摘要（供参考，避免重复）：
{existing_summary}

新增逐字稿内容：
{transcript}
`

function extractExistingSummary(content: string): string {
  // 提取已有笔记的要点摘要（前 2000 字符 + 实体名称列表）
  const summary = content.slice(0, 2000)
  const entityNames: string[] = []

  // 提取 CARD 块中的实体名称
  const cardNameRe = /(?:姓名|项目名称|概念名称|术语名称)：(.+)/g
  let match: RegExpExecArray | null
  while ((match = cardNameRe.exec(content)) !== null) {
    entityNames.push(match[1].trim())
  }

  const entityList = entityNames.length > 0 ? `\n\n已生成卡片的实体：${entityNames.join('、')}` : ''

  return summary + entityList
}

function mergeSegmentResults(baseContent: string, supplements: string[]): string {
  let result = baseContent

  for (const supplement of supplements) {
    if (supplement.includes('（本段无新增内容）')) continue

    // 提取新增要点
    const pointsMatch = supplement.match(/## 新增要点\n([\s\S]*?)(?=## |$)/)
    if (pointsMatch) {
      const newPoints = pointsMatch[1].trim()
      if (newPoints && !newPoints.includes('无新增')) {
        // 追加到「主要内容概览」或「本期主要内容」段落末尾
        const overviewRe = /(# (?:本期主要内容|主要内容概览)\n[\s\S]*?)(?=\n# |\n---CARD)/
        const overviewMatch = result.match(overviewRe)
        if (overviewMatch) {
          result = result.replace(overviewRe, `$1${newPoints}\n`)
        }
      }
    }

    // 提取新增实体 CARD 块
    const cardTypes = ['PEOPLE', 'PROJECT', 'CONCEPT', 'TERM'] as const
    for (const type of cardTypes) {
      const cardRe = new RegExp(`---CARD-${type}---\\n([\\s\\S]*?)\\n---CARD-${type}-END---`, 'g')
      let cardMatch: RegExpExecArray | null
      while ((cardMatch = cardRe.exec(supplement)) !== null) {
        const cardBlock = cardMatch[0]
        // 检查是否已存在同名卡片
        const nameMatch = cardBlock.match(/(?:姓名|项目名称|概念名称|术语名称)：(.+)/)
        if (nameMatch) {
          const name = nameMatch[1].trim()
          if (result.includes(`${nameMatch[0].split('：')[0]}：${name}`)) continue // 已存在
        }
        // 追加到笔记末尾（在其他 CARD 块之后）
        result += `\n\n${cardBlock}`
      }
    }

    // 提取新增术语词典条目
    const termMatch = supplement.match(/## 新增术语词典条目\n([\s\S]*?)(?=## |$)/)
    if (termMatch) {
      const newTerms = termMatch[1].trim()
      if (newTerms) {
        // 追加到术语词典段落
        const glossaryRe = /(# 术语词典[^\n]*\n(?:>[^\n]*\n)?[\s\S]*?)(?=\n# |\n---CARD)/
        const glossaryMatch = result.match(glossaryRe)
        if (glossaryMatch) {
          result = result.replace(glossaryRe, `$1${newTerms}\n`)
        }
      }
    }

    // 提取新增关联实体（人物/项目/概念索引）
    for (const section of ['关联人物', '关联项目', '关联概念']) {
      const sectionRe = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=## |$)`)
      const sectionMatch = supplement.match(sectionRe)
      if (sectionMatch) {
        const newLinks = sectionMatch[1].trim()
        if (newLinks) {
          const existingRe = new RegExp(`(# ${section}\\n[\\s\\S]*?)(?=\\n# |\\n---CARD)`)
          const existingMatch = result.match(existingRe)
          if (existingMatch) {
            // 去重后追加
            const existingLinks = new Set(existingMatch[1].match(/\[\[[^\]]+\]\]/g) || [])
            const linksToAdd = (newLinks.match(/\[\[[^\]]+\]\]/g) || []).filter(
              l => !existingLinks.has(l),
            )
            if (linksToAdd.length > 0) {
              result = result.replace(existingRe, `$1${linksToAdd.map(l => `- ${l}`).join('\n')}\n`)
            }
          }
        }
      }
    }
  }

  return result
}

async function generateNotesSegmented(
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: AIProviderId,
  transcript: string,
  date: string,
  signal?: AbortSignal,
  onSegmentProgress?: (current: number, total: number) => void,
): Promise<{ content: string | null; cost: number; finishReason?: string }> {
  const segments = splitTranscript(transcript)
  console.log(`📏 长文本分段处理：${transcript.length} 字符 → ${segments.length} 段`)

  const prompt = getAIPrompt()
  let totalCost = 0

  // 第一段：完整 prompt
  onSegmentProgress?.(1, segments.length)
  console.log(`  ⏳ 分段 1/${segments.length}...`)
  const firstResult = await callAI(
    providerConfig,
    providerId,
    '知识管理助手',
    prompt.replace('{date}', date).replace('{transcript}', segments[0]),
    16384,
    signal,
    0.3,
  )
  totalCost += firstResult.cost

  if (!firstResult.content || segments.length === 1) {
    return firstResult
  }

  // 后续段：补充 prompt
  const supplements: string[] = []
  let existingSummary = extractExistingSummary(firstResult.content)

  for (let i = 1; i < segments.length; i++) {
    onSegmentProgress?.(i + 1, segments.length)
    console.log(`  ⏳ 分段 ${i + 1}/${segments.length}...`)

    try {
      const followupPrompt = SEGMENT_FOLLOWUP_PROMPT.replace(
        '{existing_summary}',
        existingSummary,
      ).replace('{transcript}', segments[i])

      const segResult = await callAI(
        providerConfig,
        providerId,
        '知识管理助手',
        followupPrompt,
        8192,
        signal,
        0.3,
      )
      totalCost += segResult.cost

      if (segResult.content) {
        supplements.push(segResult.content)
        // 更新摘要供下一段参考
        existingSummary = extractExistingSummary(
          firstResult.content + '\n' + supplements.join('\n'),
        )
      }
    } catch (err) {
      console.log(`  ❌ 分段 ${i + 1} 生成失败: ${err instanceof Error ? err.message : err}`)
      // 跳过失败段，继续处理后续段
    }
  }

  // 合并结果
  const merged = mergeSegmentResults(firstResult.content, supplements)
  console.log(`  ✅ 分段合并完成，补充了 ${supplements.length} 段内容`)

  return { content: merged, cost: totalCost }
}

// ── 质量评估 ──

export interface QualityScore {
  overall: number
  contentCoverage: number
  entityCompleteness: number
  wikiLinkCoverage: number
  formatCompliance: number
  details: string[]
}

export function evaluateQuality(transcript: string, noteContent: string): QualityScore {
  const details: string[] = []

  // 1. 内容覆盖率 (40%)：提取转写中的关键名词，检查笔记正文覆盖率
  const nounRe = /\[\[([^\]|]+)\]\]/g
  const transcriptNouns = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = nounRe.exec(transcript)) !== null) {
    if (m[1].length >= 2) transcriptNouns.add(m[1])
  }
  // 也提取转写中的大写英文词和中文专有名词（2字以上连续中文词）
  const cnNounRe =
    /[\u4e00-\u9fff]{2,6}(?:公司|集团|平台|技术|模型|系统|网络|引擎|框架|协议|算法|实验室|大学|学院)/g
  while ((m = cnNounRe.exec(transcript)) !== null) {
    transcriptNouns.add(m[0])
  }

  let contentCoverage = 100
  if (transcriptNouns.size > 0) {
    let found = 0
    for (const noun of transcriptNouns) {
      if (noteContent.includes(noun)) found++
    }
    contentCoverage = Math.round((found / transcriptNouns.size) * 100)
    if (contentCoverage < 80) {
      details.push(
        `内容覆盖率 ${contentCoverage}%：${transcriptNouns.size - Math.round(found)} 个关键名词未在笔记中出现`,
      )
    }
  }

  // 2. 实体完整度 (25%)：CARD 块数量 / 正文 wiki-link 去重数量
  const cardCount = (noteContent.match(/---CARD-(?:PEOPLE|PROJECT|CONCEPT|TERM)---/g) || []).length
  const bodyLinks = new Set<string>()
  const bodyLinkRe = /\[\[([^\]|]+)\]\]/g
  while ((m = bodyLinkRe.exec(noteContent)) !== null) {
    bodyLinks.add(m[1])
  }

  // 提取所有 CARD 中的实体名称（共享给维度 2 和 3）
  const cardNames = new Set<string>()
  const cardNameRe = /(?:姓名|项目名称|概念名称|术语名称)：(.+)/g
  while ((m = cardNameRe.exec(noteContent)) !== null) {
    cardNames.add(m[1].trim())
  }

  let entityCompleteness = 100
  if (bodyLinks.size > 0) {
    let matched = 0
    for (const link of bodyLinks) {
      if (cardNames.has(link)) matched++
    }
    entityCompleteness = Math.round((matched / bodyLinks.size) * 100)
    entityCompleteness = Math.max(entityCompleteness, Math.min(100, cardCount * 10))
    if (entityCompleteness < 70) {
      details.push(
        `实体完整度 ${entityCompleteness}%：${bodyLinks.size - matched} 个正文链接缺少对应卡片`,
      )
    }
  }

  // 3. wiki-link 覆盖 (20%)：检查正文中首次出现的人名/项目名是否被 [[ ]] 包裹
  // 通过对比 CARD 中的实体名是否在正文中以 [[ ]] 形式出现
  let wikiLinkCoverage = 100
  if (cardNames.size > 0) {
    let wrappedCount = 0
    for (const name of cardNames) {
      // 检查笔记正文中该实体是否以 [[name]] 形式出现
      if (noteContent.includes(`[[${name}]]`)) wrappedCount++
    }
    wikiLinkCoverage = Math.round((wrappedCount / cardNames.size) * 100)
    if (wikiLinkCoverage < 80) {
      details.push(
        `wiki-link 覆盖 ${wikiLinkCoverage}%：${cardNames.size - wrappedCount} 个实体名未被 [[ ]] 包裹`,
      )
    }
  }

  // 4. 格式合规性 (15%)：检查 frontmatter + 必要模块
  let formatCompliance = 100
  const formatIssues: string[] = []
  if (!noteContent.startsWith('---')) {
    formatCompliance -= 30
    formatIssues.push('缺少 YAML frontmatter')
  } else {
    const fmEnd = noteContent.indexOf('\n---', 3)
    if (fmEnd === -1) {
      formatCompliance -= 30
      formatIssues.push('frontmatter 未闭合')
    } else {
      const fm = noteContent.substring(0, fmEnd)
      for (const field of ['type', 'show', 'date', 'tags', 'category']) {
        if (!fm.includes(`${field}:`)) {
          formatCompliance -= 5
          formatIssues.push(`frontmatter 缺少 ${field}`)
        }
      }
    }
  }
  if (!noteContent.includes('# 一句话总结')) {
    formatCompliance -= 10
    formatIssues.push('缺少一句话总结')
  }
  if (!noteContent.includes('术语词典')) {
    formatCompliance -= 10
    formatIssues.push('缺少术语词典模块')
  }
  formatCompliance = Math.max(0, formatCompliance)
  if (formatIssues.length > 0) {
    details.push(`格式问题：${formatIssues.join('、')}`)
  }

  // 综合评分
  const overall = Math.round(
    contentCoverage * 0.4 +
      entityCompleteness * 0.25 +
      wikiLinkCoverage * 0.2 +
      formatCompliance * 0.15,
  )

  return {
    overall,
    contentCoverage,
    entityCompleteness,
    wikiLinkCoverage,
    formatCompliance,
    details,
  }
}

// 兼容旧接口：使用 DeepSeek 配置
export async function correctTranscriptLegacy(
  apiKey: string,
  transcript: string,
  signal?: AbortSignal,
) {
  return correctTranscript(
    { baseUrl: 'https://api.deepseek.com', apiKey, model: 'deepseek-v4-flash' },
    'deepseek',
    transcript,
    signal,
  )
}

export async function generateNotesLegacy(
  apiKey: string,
  transcript: string,
  signal?: AbortSignal,
) {
  return generateNotes(
    { baseUrl: 'https://api.deepseek.com', apiKey, model: 'deepseek-v4-flash' },
    'deepseek',
    transcript,
    signal,
  )
}
