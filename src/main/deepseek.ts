const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

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
2. 术语词典中的每个术语，用 [[术语名]] 格式包裹，以便在 Obsidian 中建立双向链接。
3. 「关联延伸」中的书籍、论文、人物、节目等也用 [[xxx]] 包裹。
4. 语言使用简体中文（播客中的英文内容保留原文）。
5. 如果逐字稿中没有相关信息，该板块写「（本期未提及）」。

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

# 术语词典
- [[术语1]]：解释

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

---CARD-PEOPLE---
姓名：张三
角色：AI 创业者 / 学者 / 行业专家
核心观点：
  他认为AI时代最重要的能力是沟通能力。
  他不觉得中年人会被AI取代。
时间轴：12:30-18:45 讨论AI对工作影响
---CARD-PEOPLE-END---

---CARD-PROJECT---
项目名称：小宇宙
核心定位：中文播客平台
提及时间点：05:00-08:30, 22:10-25:00
相关链接：https://xiaoyuzhoufm.com
---CARD-PROJECT-END---

---CARD-CONCEPT---
概念名称：向量数据库
核心解释：一种能理解数据语义关系的数据库，而非仅靠关键词匹配
相关概念：[[传统数据库]], [[AI Agent]], [[RAG]]
---CARD-CONCEPT-END---

请处理以下逐字稿：

{transcript}
`

async function callDeepseekRaw(apiKey: string, systemPrompt: string, userPrompt: string, maxTokens = 4096, signal?: AbortSignal) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  })

  if (!resp.ok) {
    throw new Error(`DeepSeek API HTTP ${resp.status}`)
  }

  const result = await resp.json() as any
  if (result.error) {
    throw new Error(`DeepSeek API 错误: ${result.error.message || JSON.stringify(result.error)}`)
  }

  const content = result.choices?.[0]?.message?.content
  const usage = result.usage || {}
  const cost = (usage.prompt_tokens || 0) * 0.000001 + (usage.completion_tokens || 0) * 0.000002
  return { content: content || null, cost }
}

export async function correctTranscript(apiKey: string, transcript: string, signal?: AbortSignal) {
  return callDeepseekRaw(apiKey, '转录校对员', CORRECTION_PROMPT.replace('{transcript}', transcript), 4096, signal)
}

export async function generateNotes(apiKey: string, transcript: string, signal?: AbortSignal) {
  const date = new Date().toISOString().split('T')[0]
  return callDeepseekRaw(apiKey, '知识管理助手', AI_PROMPT.replace('{date}', date).replace('{transcript}', transcript), undefined, signal)
}
