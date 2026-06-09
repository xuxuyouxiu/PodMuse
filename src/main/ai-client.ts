import type { AIProviderId } from '../shared/types'

// 重试配置
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000 // 1秒基础延迟
const MAX_DELAY_MS = 10000 // 最大延迟10秒

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

// 根据内容类型生成完整的 prompt
function getAIPrompt(): string {
  return `你是一位专业的知识管理助手。请根据以下播客节目的逐字稿，生成一份结构化的知识笔记。

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
   - 通用访谈/对话类：按内容相关性自由选择模块` + AI_PROMPT
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
    if (msg.includes('rate_limit') || 
        msg.includes('overloaded') || 
        msg.includes('timeout') ||
        msg.includes('insufficient_quota')) {
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
  signal?: AbortSignal
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
          'Authorization': `Bearer ${providerConfig.apiKey}` 
        },
        body: JSON.stringify({
          model: providerConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
      })

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '')
        throw new Error(`API HTTP ${resp.status}: ${errorText}`)
      }

      const result = await resp.json() as {
        error?: { message?: string }
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      if (result.error) {
        throw new Error(`API 错误: ${result.error.message || JSON.stringify(result.error)}`)
      }

      const content = result.choices?.[0]?.message?.content
      const usage = result.usage || {}
      // 简单估算成本（不同供应商价格不同，这里用通用估算）
      const cost = (usage.prompt_tokens || 0) * 0.000001 + (usage.completion_tokens || 0) * 0.000002
      return { content: content || null, cost }
      
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
      console.log(`AI API 调用失败，${(delay / 1000).toFixed(1)}秒后重试 (${attempt + 1}/${MAX_RETRIES}): ${errDetail}`)
      
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
  signal?: AbortSignal
) {
  return callAI(
    providerConfig,
    providerId,
    '转录校对员',
    CORRECTION_PROMPT.replace('{transcript}', transcript),
    4096,
    signal
  )
}

// 导出的函数：生成笔记
export async function generateNotes(
  providerConfig: { baseUrl: string; apiKey: string; model: string },
  providerId: AIProviderId,
  transcript: string,
  signal?: AbortSignal,
) {
  const date = new Date().toISOString().split('T')[0]
  const prompt = getAIPrompt()
  return callAI(
    providerConfig,
    providerId,
    '知识管理助手',
    prompt.replace('{date}', date).replace('{transcript}', transcript),
    8192, // 增加输出token限制到8192，确保长音频内容完整
    signal
  )
}

// 兼容旧接口：使用 DeepSeek 配置
export async function correctTranscriptLegacy(apiKey: string, transcript: string, signal?: AbortSignal) {
  return correctTranscript(
    { baseUrl: 'https://api.deepseek.com', apiKey, model: 'deepseek-v4-flash' },
    'deepseek',
    transcript,
    signal
  )
}

export async function generateNotesLegacy(apiKey: string, transcript: string, signal?: AbortSignal) {
  return generateNotes(
    { baseUrl: 'https://api.deepseek.com', apiKey, model: 'deepseek-v4-flash' },
    'deepseek',
    transcript,
    signal,
  )
}
