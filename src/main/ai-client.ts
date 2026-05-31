import type { AIProviderId, AIProviderConfig } from '../shared/types'

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

const AI_PROMPT = `你是一位专业的知识管理助手。请根据以下播客节目的逐字稿，生成一份结构化的知识笔记。

这段播客可能包含中文、英文或中英混合内容。

要求：
1. 输出为纯 Markdown 格式，使用以下模板结构，不要添加模板以外的任何解释。
2. **重要：必须覆盖播客从头到尾的所有重要内容**，不要只提炼前半部分。如果内容很多，请精简表达但不要遗漏后半部分的关键观点。
3. 「术语词典」仅作为术语名称索引，每个术语用 [[术语名]] 格式包裹。术语的完整解释、定义和补充说明全部放在对应的 CARD-TERM 卡片中。**术语词典中列出的每一个术语都必须生成对应的 CARD-TERM 卡片，不允许遗漏。**
4. 「关联延伸」中的书籍、论文、人物、节目等也用 [[xxx]] 包裹。
5. **人物卡片硬性筛选（最高优先级）：** 绝对不要为没有公开知名度的人物生成 CARD-PEOPLE 卡片。具体规则见下方实体区的详细说明。如果不确定某人是否符合条件，跳过他，宁可少生成也不要多生成。
6. 语言使用简体中文（播客中的英文内容保留原文）。
7. 如果逐字稿中没有相关信息，该板块写「（本期未提及）」。

---

模板结构：

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

# 一句话总结

---

# 核心观点

## 主持人
- 观点

## 嘉宾
- 观点

---

# 关键对话还原

> 主题：

---

# 术语词典（索引）
> 术语的完整释义已迁移至对应卡片，此处仅保留术语名称。

- [[术语1]]
- [[术语2]]

---

# 关联延伸
- 书籍：[[书名]]
- 人物：[[人物]]
- 可深入了解的方向：

---

# 金句摘录

---

# 关联人物
- [[人物名]]

# 关联项目
- [[项目名]]

# 关联概念
- [[概念名]]

---

另外，请检测本期播客中提到的所有重要实体，按以下格式输出。
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

// 构建请求URL
function buildApiUrl(baseUrl: string, providerId: AIProviderId): string {
  // 确保 baseUrl 以 /v1 结尾
  let url = baseUrl.replace(/\/+$/, '')
  if (!url.endsWith('/v1')) {
    url += '/v1'
  }
  return `${url}/chat/completions`
}

// 判断错误是否可重试
function isRetryableError(error: any): boolean {
  // 网络错误、超时、连接重置
  if (error.name === 'TypeError' && error.message.includes('fetch')) return true
  if (error.name === 'AbortError') return true
  
  // HTTP 状态码错误
  if (error.message.includes('HTTP')) {
    const statusMatch = error.message.match(/HTTP (\d+)/)
    if (statusMatch) {
      const status = parseInt(statusMatch[1])
      // 429 请求过多、5xx 服务器错误可重试
      if (status === 429 || status >= 500) return true
      // 4xx 客户端错误（除了429）不可重试
      if (status >= 400 && status < 500) return false
    }
  }
  
  // API 特定错误
  if (error.message.includes('API 错误') || error.message.includes('API error')) {
    if (error.message.includes('rate_limit') || 
        error.message.includes('overloaded') || 
        error.message.includes('timeout') ||
        error.message.includes('insufficient_quota')) {
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
  
  let lastError: any = null
  
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

      const result = await resp.json() as any
      if (result.error) {
        throw new Error(`API 错误: ${result.error.message || JSON.stringify(result.error)}`)
      }

      const content = result.choices?.[0]?.message?.content
      const usage = result.usage || {}
      // 简单估算成本（不同供应商价格不同，这里用通用估算）
      const cost = (usage.prompt_tokens || 0) * 0.000001 + (usage.completion_tokens || 0) * 0.000002
      return { content: content || null, cost }
      
    } catch (error: any) {
      lastError = error
      
      // 如果是用户主动取消，直接抛出
      if (signal?.aborted || error.name === 'AbortError') {
        throw error
      }
      
      // 如果是最后一次尝试或错误不可重试，抛出错误
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error
      }
      
      // 等待后重试
      const delay = getDelay(attempt)
      console.log(`AI API 调用失败，${(delay / 1000).toFixed(1)}秒后重试 (${attempt + 1}/${MAX_RETRIES}): ${error.message}`)
      
      // 等待延迟，但可被取消
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, delay)
        
        if (signal) {
          const abortHandler = () => {
            clearTimeout(timeoutId)
            reject(Object.assign(new Error('已取消'), { name: 'AbortError' }))
          }
          
          signal.addEventListener('abort', abortHandler, { once: true })
          
          const cleanupTimeoutId = setTimeout(() => {
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
  signal?: AbortSignal
) {
  const date = new Date().toISOString().split('T')[0]
  return callAI(
    providerConfig,
    providerId,
    '知识管理助手',
    AI_PROMPT.replace('{date}', date).replace('{transcript}', transcript),
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
    signal
  )
}
