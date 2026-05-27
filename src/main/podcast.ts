import * as path from 'path'
import * as fs from 'fs'
import { StepInfo } from '@shared/types'
import { runWhisper } from './whisper'
import { correctTranscript, generateNotes } from './deepseek'
import { pickCategoryName, parseTagsFromMarkdown, sanitizePathSegment, resolveUniquePath, parseCategoryFromMarkdown, resolveBestFolder } from './obsidian-categories'
import { parseEntityBlocks, writeEntityNotes, fillMissingTermCards } from './entity-cards'

const HEADERS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

const XIAOYUZHOU_PATTERN = /^https?:\/\/[^\s]*xiaoyuzhoufm\.com\/[^\s]+/i

export async function fetchPodcastTitle(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    })
    if (!resp.ok) return null
    const html = await resp.text()
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    return titleMatch ? titleMatch[1].trim() : null
  } catch {
    return null
  }
}

function getTempDir(audioDir: string) {
  const { app } = require('electron')
  const d = audioDir || path.join(app.getPath('userData'), '_podcast_temp')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function sanitize(name: string) {
  return name.replace(/[<>:"/\\|?*\n\r\t]/g, '_').trim()
}

function findAudioInJSON(obj: any, depth = 0): string | null {
  if (depth > 12 || !obj) return null
  const audioKeys = ['mediaKey', 'enclosureUrl', 'mediaUrl', 'audioUrl', 'streamUrl', 'url']
  const hints = ['.mp3', '.m4a', '.ogg', '.aac', 'audio', 'podcast', 'sound']
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key of audioKeys) {
      const val = obj[key]
      if (typeof val === 'string' && val.startsWith('http') && hints.some(h => val.toLowerCase().includes(h))) return val
    }
    for (const val of Object.values(obj)) {
      const found = findAudioInJSON(val, depth + 1)
      if (found) return found
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findAudioInJSON(item, depth + 1)
      if (found) return found
    }
  }
  return null
}

async function extractAudio(url: string) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
  })
  if (!resp.ok) {
    throw new Error(`抓取页面失败 HTTP ${resp.status}`)
  }
  const html = await resp.text()
  let title: string | null = null, audioUrl: string | null = null

  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  if (titleMatch) title = titleMatch[1].trim()

  const audioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/i)
  if (audioMatch) audioUrl = audioMatch[1]

  if (!audioUrl) {
    const nd = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>\s*(\{.*?\})\s*<\/script>/si)
    if (nd) { try { audioUrl = findAudioInJSON(JSON.parse(nd[1])) } catch {} }
  }
  if (!audioUrl) {
    const at = html.match(/<audio[^>]*src="([^"]+)"/i)
    if (at) audioUrl = at[1]
  }
  if (!audioUrl) {
    const re = /<script\s+type="application\/ld\+json"[^>]*>\s*(.*?)\s*<\/script>/gsi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      try {
        const d = JSON.parse(m[1])
        if (d['@type'] === 'MediaObject' && d.contentUrl) { audioUrl = d.contentUrl; break }
      } catch {}
    }
  }
  return { audioUrl, title }
}

export async function processPodcast(
  podcastUrl: string,
  apiKey: string,
  language: string = 'zh',
  obsidianDir: string = '',
  audioDir: string = '',
  sendStep?: (step: StepInfo) => void,
  sendLog?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const log = (m: string) => { sendLog?.(m); console.log(m) }
  const step = (s: StepInfo) => {
    if (signal?.aborted && s.status !== 'stopped') return
    // #region debug-point C:step3-dispatch
    if (s.step === 3) { (()=>{let u='http://127.0.0.1:7777/event',sid='whisper-history-bugs';try{const e=fs.readFileSync('.dbg/whisper-history-bugs.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;sid=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||sid}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,runId:'pre-fix',hypothesisId:'C',location:'src/main/podcast.ts:step',msg:'[DEBUG] step3 dispatch to renderer',data:{subtitle:s.subtitle,status:s.status,detail:s.detail,progress:s.progress},ts:Date.now()})}).catch(()=>{})})() }
    // #endregion
    sendStep?.(s)
  }
  const check = () => { if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' }) }

  log(`开始处理: ${podcastUrl}`)

  check()
  if (!XIAOYUZHOU_PATTERN.test(podcastUrl)) {
    step({ step: 1, title: '解析页面', subtitle: '无效链接', status: 'error', detail: '不是有效的小宇宙播客链接' })
    log('  ❌ 不是有效的小宇宙播客链接')
    return null
  }

  step({ step: 1, title: '解析页面', subtitle: '提取音频链接', status: 'running', detail: '正在抓取小宇宙页面...' })
  let audioUrl: string | null = null
  let title: string | null = null
  try {
    const result = await extractAudio(podcastUrl)
    audioUrl = result.audioUrl
    title = result.title
  } catch (e: any) {
    step({ step: 1, title: '解析页面', subtitle: '网络错误', status: 'error', detail: e.message })
    log(`  ❌ 解析页面失败: ${e.message}`)
    return null
  }
  if (!audioUrl) {
    step({ step: 1, title: '解析页面', subtitle: '提取音频链接', status: 'error', detail: '未找到音频链接' })
    log('  ❌ 无法提取音频链接')
    return null
  }
  step({ step: 1, title: '解析页面', subtitle: title || '未知标题', status: 'done', detail: '找到音频链接' })
  log(`  标题: ${title || '未知'}`)

  check()
  step({ step: 2, title: '下载音频', subtitle: '下载中...', status: 'running', detail: '开始下载', progress: 0 })
  log('  [2/5] 下载音频...')
  const tmp = getTempDir(audioDir)
  let ext = audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'mp3'
  if (!['mp3', 'm4a', 'ogg', 'aac', 'wav'].includes(ext)) ext = 'mp3'
  const audioName = sanitize(title || 'episode')
  const audioPath = path.join(tmp, `${audioName}.${ext}`)

  if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1024) {
    log('  ⏭ 音频已存在，跳过下载')
    step({ step: 2, title: '下载音频', subtitle: `${(fs.statSync(audioPath).size / 1048576).toFixed(1)} MB (已缓存)`, status: 'done', progress: 100 })
  } else {
    try {
      const audioResp = await fetch(audioUrl, { headers: { 'User-Agent': HEADERS_UA }, signal })
      if (!audioResp.ok || !audioResp.body) {
        step({ step: 2, title: '下载音频', subtitle: `HTTP ${audioResp.status}`, status: 'error' })
        log(`  ❌ 下载失败 HTTP ${audioResp.status}`)
        return null
      }
      const reader = audioResp.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      const total = parseInt(audioResp.headers.get('content-length') || '0')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total > 0) {
          step({ step: 2, title: '下载音频', subtitle: '下载中...', status: 'running', detail: `${(received / 1048576).toFixed(1)} MB`, progress: Math.round((received / total) * 100) })
        }
      }
      if (received === 0) {
        step({ step: 2, title: '下载音频', subtitle: '空文件', status: 'error' })
        log('  ❌ 下载内容为空')
        return null
      }
      fs.writeFileSync(audioPath, Buffer.concat(chunks))
      step({ step: 2, title: '下载音频', subtitle: `${(received / 1048576).toFixed(1)} MB`, status: 'done', progress: 100 })
      log('  ✓ 下载完成')
    } catch (e: any) {
      if (signal?.aborted) throw e
      step({ step: 2, title: '下载音频', subtitle: '下载失败', status: 'error', detail: e.message })
      log(`  ❌ 下载失败: ${e.message}`)
      return null
    }
  }

  check()
  step({ step: 3, title: '语音转文字', subtitle: 'Whisper 准备中', status: 'running', detail: '正在加载模型' })
  log('  [3/5] 语音转文字 (Whisper)...')
  if (!fs.existsSync(audioPath)) {
    step({ step: 3, title: '语音转文字', subtitle: '文件丢失', status: 'error', detail: audioPath })
    log(`  ❌ 音频文件不存在: ${audioPath}`)
    return null
  }
  const transcript = await runWhisper(
    audioPath, language, sendLog,
    (status) => step({
      step: 3,
      title: '语音转文字',
      subtitle: status.subtitle,
      status: status.phase === 'finalizing' ? 'done' : 'running',
      detail: status.detail,
      progress: status.progress,
    }),
    signal,
  )
  if (!transcript) {
    if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' })
    step({ step: 3, title: '语音转文字', subtitle: '转写失败', status: 'error', detail: '检查 Whisper 是否正常工作' })
    log('  ❌ 语音转文字失败')
    return null
  }
  step({ step: 3, title: '语音转文字', subtitle: `共 ${transcript.length} 字`, status: 'done' })
  log(`  ✓ 转写完成，共 ${transcript.length} 字`)

  check()
  if (!apiKey) {
    step({ step: 4, title: '修正专有名词', subtitle: '未配置 API Key', status: 'error' })
    log('  ❌ 未配置 DeepSeek API Key，跳过 AI 处理')
    return null
  }

  step({ step: 4, title: '修正专有名词', subtitle: 'DeepSeek AI 修正中...', status: 'running' })
  log('  [4/5] 修正专有名词 (DeepSeek)...')
  let finalTranscript = transcript
  try {
    const correction = await correctTranscript(apiKey, transcript, signal)
    if (correction.content) {
      finalTranscript = correction.content
      step({ step: 4, title: '修正专有名词', subtitle: `≈¥${correction.cost.toFixed(4)}`, status: 'done' })
      log(`  ✓ 修正完成 (≈¥${correction.cost.toFixed(4)})`)
    } else {
      step({ step: 4, title: '修正专有名词', subtitle: '跳过（使用原始转录）', status: 'done' })
      log('  ⚠ 修正失败，使用原始转录')
    }
  } catch (e: any) {
    if (signal?.aborted) throw e
    step({ step: 4, title: '修正专有名词', subtitle: 'API 异常，使用原始转录', status: 'done' })
    log(`  ⚠ DeepSeek 修正异常: ${e.message}，使用原始转录`)
  }

  check()
  step({ step: 5, title: 'AI 提炼笔记', subtitle: 'DeepSeek 生成中...', status: 'running' })
  log('  [5/5] AI 提炼笔记 (DeepSeek)...')
  let notes: { content: string | null; cost: number }
  try {
    notes = await generateNotes(apiKey, finalTranscript, signal)
  } catch (e: any) {
    step({ step: 5, title: 'AI 提炼笔记', subtitle: 'API 异常', status: 'error', detail: e.message })
    log(`  ❌ DeepSeek 生成异常: ${e.message}`)
    return null
  }
  if (!notes.content) {
    step({ step: 5, title: 'AI 提炼笔记', subtitle: '提炼失败', status: 'error' })
    log('  ❌ AI 提炼失败')
    return null
  }
  step({ step: 5, title: 'AI 提炼笔记', subtitle: `≈¥${notes.cost.toFixed(4)}`, status: 'done' })
  log(`  ✓ 提炼完成 (≈¥${notes.cost.toFixed(4)})`)

  const entities = parseEntityBlocks(notes.content)
  const { entities: patchedEntities, filled: filledTerms } = fillMissingTermCards(notes.content, entities)
  if (filledTerms > 0) {
    log(`  ⚠ 检测到 ${filledTerms} 个术语在词典中存在但缺少卡片，已自动补全`)
  }
  if (patchedEntities.people.length || patchedEntities.projects.length || patchedEntities.concepts.length || patchedEntities.terms.length) {
    const cardResult = await writeEntityNotes({ entities: patchedEntities, obsidianDir: obsidianDir, podcastFilename: `${sanitize(title || '未命名播客')}.md`, apiKey }, signal)
    const parts: string[] = []
    if (cardResult.peopleWritten) parts.push(`${cardResult.peopleWritten} 人物`)
    if (cardResult.projectsWritten) parts.push(`${cardResult.projectsWritten} 项目`)
    if (cardResult.conceptsWritten) parts.push(`${cardResult.conceptsWritten} 概念`)
    if (cardResult.termsWritten) parts.push(`${cardResult.termsWritten} 术语`)
    if (cardResult.termToConcept) {
      const searchInfo = cardResult.conceptSearched > 0 ? `（${cardResult.conceptSearched} 个已联网获取定义）` : ''
      parts.push(`${cardResult.termToConcept} 术语→概念${searchInfo}`)
    }
    log(`  🃏 生成实体卡片: ${parts.join(', ')}`)
  }

  const obsDir = obsidianDir
  if (!fs.existsSync(obsDir)) fs.mkdirSync(obsDir, { recursive: true })
  const filename = sanitize(title || '未命名播客')

  const aiCategory = parseCategoryFromMarkdown(notes.content)
  let categoryFolder: string
  if (aiCategory) {
    categoryFolder = resolveBestFolder(obsDir, aiCategory, log)
  } else {
    const tags = parseTagsFromMarkdown(notes.content)
    const cfg = { version: 1 as const, categories: [], rules: [] }
    categoryFolder = pickCategoryName(tags, cfg, log)
  }
  const saveDir = path.join(obsDir, sanitizePathSegment(categoryFolder))
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

  const { destPath: filepath } = resolveUniquePath(saveDir, filename, '.md')
  fs.writeFileSync(filepath, notes.content, 'utf-8')

  log(`  📝 笔记已保存: ${sanitizePathSegment(categoryFolder)}/${path.basename(filepath)}`)
  return path.basename(filepath)
}
